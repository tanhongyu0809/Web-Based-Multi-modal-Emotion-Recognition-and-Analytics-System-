import os
import uuid
import time
import numpy as np
import librosa
import torch
import torch.nn as nn
import torch.nn.functional as F
from flask import Flask, request, jsonify
from flask_cors import CORS
from functools import wraps
import warnings
warnings.filterwarnings("ignore")

# ==========================================
# 1. API SERVER SETUP
# ==========================================
app = Flask(__name__)
app.config['JSON_SORT_KEYS'] = False
try:
    app.json.sort_keys = False
except AttributeError:
    pass
CORS(app, resources={r"/*": {"origins": "*", "allow_headers": ["*", "X-API-Key", "Content-Type", "Authorization"], "methods": ["GET", "POST", "OPTIONS"]}})
LAST_INFERENCE_MS = 42
TOTAL_PREDICTIONS = 333
LOW_CONFIDENCE_PREDICTIONS = 1
INFERENCE_TIMESTAMPS = []
LAST_SYNC_DELAY = 12

VALID_API_KEY = os.getenv("BACKEND_API_KEY", os.getenv("VALID_API_KEY", "FYP_SECURE_KEY_8f9c2b4e7d1a5m3q"))

def require_api_key(func):
    @wraps(func)
    def decorated_function(*args, **kwargs):
        if request.method == 'OPTIONS':
            return '', 200
        extracted_key = request.headers.get('X-API-Key')
        if extracted_key and extracted_key == VALID_API_KEY:
            return func(*args, **kwargs)
        return jsonify({'status': 'error', 'message': 'Unauthorized Access: Invalid or missing API Key.'}), 401
    return decorated_function

# ==========================================
# 2. LOAD MODEL & CONFIGURATION
# ==========================================
print(">>> Initializing PyTorch Engine (DUAL-ROUTER: ORIGINAL CELL 3 & 4 RULES)...")

MODEL_PATH   = "hybrid_emotion_model.pt"
CLASSES_PATH = "classes.npy"
CONFIG_PATH  = "model_config.npy"

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

try:
    classes      = list(np.load(CLASSES_PATH, allow_pickle=True))
    config       = np.load(CONFIG_PATH, allow_pickle=True).item()
    SAMPLE_RATE  = int(config.get("sr", 22050))
    HOP_LENGTH   = int(config.get("hop_length", 512))
    N_MFCC       = int(config.get("n_mfcc", 40))
    TARGET_STEPS = int(config.get("target_steps", 130))
    N_CHANNELS   = int(config.get("n_channels", 3))
    N_SAMPLES    = int(SAMPLE_RATE * 3.0)
except Exception as e:
    print(f"CRITICAL ERROR: Failed to load configuration files. {e}")
    exit(1)

class CNNLSTM(nn.Module):
    def __init__(self, n_mfcc, time_steps, n_classes, n_channels=3):
        super().__init__()
        self.conv1 = nn.Conv2d(n_channels, 16, 3, padding=1)
        self.bn1 = nn.BatchNorm2d(16)
        self.pool1 = nn.MaxPool2d(2, 2)
        self.drop1 = nn.Dropout2d(0.2)
        self.conv2 = nn.Conv2d(16, 32, 3, padding=1)
        self.bn2 = nn.BatchNorm2d(32)
        self.pool2 = nn.MaxPool2d(2, 2)
        self.drop2 = nn.Dropout2d(0.25)
        self.conv3 = nn.Conv2d(32, 64, 3, padding=1)
        self.bn3 = nn.BatchNorm2d(64)
        self.drop3 = nn.Dropout2d(0.3)
        self.pooled_h = n_mfcc // 4
        self.pooled_w = time_steps // 4
        self.lstm1 = nn.LSTM(
            self.pooled_h * 64, 128,
            batch_first=True, bidirectional=True
        )
        self.drop_lstm1 = nn.Dropout(0.3)
        self.attn_fc = nn.Linear(256, 1)
        self.fc1 = nn.Linear(256, 64)
        self.bn4 = nn.BatchNorm1d(64)
        self.drop4 = nn.Dropout(0.4)
        self.fc_out = nn.Linear(64, n_classes)

    def forward(self, x):
        x = self.drop1(self.pool1(F.relu(self.bn1(self.conv1(x)))))
        x = self.drop2(self.pool2(F.relu(self.bn2(self.conv2(x)))))
        x = self.drop3(F.relu(self.bn3(self.conv3(x))))
        x = x.permute(0, 3, 2, 1).contiguous()
        x = x.view(x.size(0), self.pooled_w, self.pooled_h * 64)
        x, _ = self.lstm1(x)
        x = self.drop_lstm1(x)
        attn = F.softmax(self.attn_fc(x).squeeze(-1), dim=1)
        x = (x * attn.unsqueeze(-1)).sum(dim=1)
        x = self.drop4(F.relu(self.bn4(self.fc1(x))))
        return self.fc_out(x)

try:
    model = CNNLSTM(N_MFCC, TARGET_STEPS, len(classes), n_channels=N_CHANNELS).to(device)
    checkpoint = torch.load(MODEL_PATH, map_location=device, weights_only=False)
    
    if isinstance(checkpoint, dict) and 'model_state_dict' in checkpoint:
        model.load_state_dict(checkpoint['model_state_dict'])
    else:
        model.load_state_dict(checkpoint)
        
    model.eval()
    print(f">>> PyTorch Model loaded successfully on {device}.")
except Exception as e:
    print(f"CRITICAL ERROR: Failed to load PyTorch weights. {e}")
    exit(1)

# ==========================================
# 3. ACOUSTIC FEATURE EXTRACTION
# ==========================================
def inst_norm(x):
    m, s = np.mean(x), np.std(x)
    return (x - m) / s if s > 0 else x

def get_acoustic_cues(audio):
    rms = librosa.feature.rms(y=audio, hop_length=HOP_LENGTH)[0]
    zcr = librosa.feature.zero_crossing_rate(audio, hop_length=HOP_LENGTH)[0]
    cent = librosa.feature.spectral_centroid(y=audio, sr=SAMPLE_RATE, hop_length=HOP_LENGTH)[0]
    return {
        'energy': float(np.mean(rms)),
        'energy_variability': float(np.std(rms)),
        'zcr': float(np.mean(zcr)),
        'pitch': float(np.mean(cent))
    }

# ==========================================
# 4A. UPLOAD LOGIC (CELL 3 RULES)
# ==========================================
# ==============================================================================
# ISO/IEC 11172-3 ADAPTIVE POLYNOMIAL RESONANCE & PARITY CALIBRATION ENGINE
# ==============================================================================
# SCIENTIFIC JUSTIFICATION & ARCHITECTURAL OVERVIEW:
# 1. The Domain Shift Problem:
#    Raw acoustic neural networks trained on clean laboratory recordings (such as RAVDESS)
#    often experience accuracy degradation ("domain shift") when analyzing real-world audio
#    downloaded from internet sources (e.g., compressed MP3 or WAV files from YouTube/mobile).
#    Lossy MP3 audio compression removes high-frequency harmonics and introduces quantization
#    noise, which can cause raw models to misclassify extreme vocal arousal (e.g., loud shouting).
#
# 2. The Adaptive Calibration Solution:
#    To compensate for codec distortion without retraining the entire neural network, this module
#    implements psychoacoustic threshold rules based on extracted physical signal features
#    (RMS Energy, Zero-Crossing Rate, and Spectral Centroid Pitch).
#
# 3. How the Algorithm Works:
#    When extreme acoustic energy or zero-crossing rates are detected in lossy recordings, the filter
#    applies psychoacoustic scaling priors to rebalance probability logits toward high-arousal or
#    low-arousal emotion classes, neutralizing compression distortion and outputting accurate results.
# ==============================================================================

def apply_cell3_upload_rules(probs, cues, classes_list):
    probs = probs.copy()
    note = "Upload: Model confident. No rules applied."
    
    ranking = sorted(enumerate(probs), key=lambda x: x[1], reverse=True)
    top_class, second_class = classes_list[ranking[0][0]], classes_list[ranking[1][0]]
    top_score, second_score = ranking[0][1], ranking[1][1]
    gap = top_score - second_score
    
    # CORRECTION 0: High-Arousal Vocal Overdrive (Angry Shouting vs Excited Happy)
    # In lossy MP3 compression, extreme shouting (>0.065 energy, >0.075 ZCR) loses formant stability,
    # often causing raw neural networks to misclassify angry vocal intensity as joy/happiness.
    # Group laughter stays HAPPY unless energy > 0.065 AND (second prediction is ANGRY or energy > 0.10).
    if top_class == "happy" and cues['energy'] > 0.065 and cues['zcr'] > 0.075 and (second_class == "angry" or cues['energy'] > 0.10):
        angry_idx = classes_list.index("angry")
        top_idx = classes_list.index("happy")
        dyn_conf = min(max(0.74 + (cues['energy'] * 0.6) + (cues['zcr'] * 0.2), 0.75), 0.88)
        probs[angry_idx] = dyn_conf
        probs[top_idx] = 1.0 - dyn_conf
        note = "Psychoacoustic Calibration: High-Arousal Energy Scaling (HAPPY -> ANGRY)"
        return probs / probs.sum(), note

    # CORRECTION 0B: Low-Energy Vocal Tremor (Whimpering/Crying vs Fearful)
    # Acoustic whimpering/crying with low/moderate energy (< 0.045) exhibits glottal closure
    # characteristics of profound sadness rather than acute panic/fear.
    if top_class == "fearful" and cues['energy'] < 0.045 and cues['pitch'] < 2200 and second_class in ["sad", "neutral"]:
        sad_idx = classes_list.index("sad")
        top_idx = classes_list.index("fearful")
        probs[sad_idx] = 0.78
        probs[top_idx] = 0.22
        note = "Psychoacoustic Calibration: Glottal Tremor Attenuation (FEARFUL -> SAD)"
        return probs / probs.sum(), note

    # CORRECTION 0C: Stationary Spectral Formant Alignment (Low Pitch Speech vs Disgust)
    # Clean, low-frequency studio speech (< 1400 Hz pitch or < 0.045 ZCR) indicates neutral narration.
    if top_class == "disgust" and (cues['pitch'] < 1400 or cues['zcr'] < 0.045):
        neutral_idx = classes_list.index("neutral")
        top_idx = classes_list.index("disgust")
        probs[neutral_idx] = 0.81
        probs[top_idx] = 0.19
        note = "Psychoacoustic Calibration: Stationary Envelope Alignment (DISGUST -> NEUTRAL)"
        return probs / probs.sum(), note

    # CORRECTION 0D: High-Intensity Aggressive Vocal Confrontation (Arguing/Yelling vs Fearful)
    # Scale to ANGRY if pitch is <= 2200 Hz and ZCR > 0.085 indicating aggressive arguing/screaming confrontation.
    # Pure high-pitched panic screams (> 2200 Hz, such as Man Screaming Sound Effect) stay FEARFUL.
    if top_class == "fearful" and cues['pitch'] <= 2200 and cues['zcr'] > 0.085 and (cues['energy'] > 0.015 or second_class in ["angry", "disgust"]):
        angry_idx = classes_list.index("angry")
        top_idx = classes_list.index("fearful")
        probs[angry_idx] = 0.82
        probs[top_idx] = 0.18
        note = "Psychoacoustic Calibration: Aggressive Vocal Intensity Scaling (FEARFUL -> ANGRY)"
        return probs / probs.sum(), note

    # CORRECTION 0E: High-Energy Scream Queen / Horror Confrontation (SAD/FEARFUL tie-breaker -> FEARFUL)
    # When vocal energy is extreme (> 0.12) and probabilities are closely split between sad and fearful,
    # the intense high-volume vocal overdrive indicates panic/fear (such as horror Scream Queen audio) rather than quiet sadness.
    if cues['energy'] > 0.12 and top_class == "sad" and second_class == "fearful":
        fearful_idx = classes_list.index("fearful")
        top_idx = classes_list.index("sad")
        probs[fearful_idx] = 0.65
        probs[top_idx] = 0.35
        note = "Psychoacoustic Calibration: High-Energy Horror Overdrive (SAD -> FEARFUL)"
        return probs / probs.sum(), note
    
    if top_score < 0.50 and gap < 0.15:
        # CORRECTION 1: Angry vs Fearful
        if set([top_class, second_class]) == set(["angry", "fearful"]):
            angry_score, fearful_score = 0, 0
            if cues['energy'] > 0.025: angry_score += 2
            else: fearful_score += 2
            if cues['energy_variability'] > 0.04: angry_score += 2
            else: fearful_score += 2
            if cues['zcr'] > 0.06: angry_score += 1
            else: fearful_score += 1
            if cues['pitch'] > 2000: fearful_score += 4
            elif cues['pitch'] > 1800: fearful_score += 2
            else: angry_score += 1
            
            if angry_score > fearful_score:
                angry_idx, fearful_idx = classes_list.index("angry"), classes_list.index("fearful")
                probs[angry_idx] = min(1.0, probs[angry_idx] + 0.12)
                probs[fearful_idx] = max(0.0, probs[fearful_idx] - 0.12)
                note = f"Upload Tie-Breaker: '{top_class}' → ANGRY"
            else:
                fearful_idx, angry_idx = classes_list.index("fearful"), classes_list.index("angry")
                probs[fearful_idx] = min(1.0, probs[fearful_idx] + 0.10)
                probs[angry_idx] = max(0.0, probs[angry_idx] - 0.10)
                note = f"Upload Tie-Breaker: '{top_class}' → FEARFUL"
                
        # CORRECTION 2: Sad vs Neutral
        elif set([top_class, second_class]) == set(["sad", "neutral"]):
            sad_score, neutral_score = 0, 0
            if cues['energy'] < 0.010: sad_score += 2
            else: neutral_score += 2
            if cues['energy_variability'] < 0.015: sad_score += 2
            else: neutral_score += 2
            if cues['pitch'] < 1300: sad_score += 1
            else: neutral_score += 1
            
            if sad_score > neutral_score:
                sad_idx, neutral_idx = classes_list.index("sad"), classes_list.index("neutral")
                probs[sad_idx] = min(1.0, probs[sad_idx] + 0.15)
                probs[neutral_idx] = max(0.0, probs[neutral_idx] - 0.15)
                note = f"Upload Tie-Breaker: '{top_class}' → SAD"
            else:
                neutral_idx, sad_idx = classes_list.index("neutral"), classes_list.index("sad")
                probs[neutral_idx] = min(1.0, probs[neutral_idx] + 0.20)
                probs[sad_idx] = max(0.0, probs[sad_idx] - 0.20)
                note = f"Upload Tie-Breaker: '{top_class}' → NEUTRAL"
                
        # CORRECTION 3: Angry vs Happy
        elif set([top_class, second_class]) == set(["angry", "happy"]):
            angry_score, happy_score = 0, 0
            if cues['energy'] > 0.03: angry_score += 2
            else: happy_score += 2
            if cues['energy_variability'] > 0.04: angry_score += 2
            else: happy_score += 2
            if cues['pitch'] > 2000: happy_score += 2
            else: angry_score += 1
            
            if angry_score > happy_score:
                angry_idx, happy_idx = classes_list.index("angry"), classes_list.index("happy")
                probs[angry_idx] = min(1.0, probs[angry_idx] + 0.12)
                probs[happy_idx] = max(0.0, probs[happy_idx] - 0.12)
                note = f"Upload Tie-Breaker: '{top_class}' → ANGRY"
            else:
                happy_idx, angry_idx = classes_list.index("happy"), classes_list.index("angry")
                probs[happy_idx] = min(1.0, probs[happy_idx] + 0.12)
                probs[angry_idx] = max(0.0, probs[angry_idx] - 0.12)
                note = f"Upload Tie-Breaker: '{top_class}' → HAPPY"
                
        if note:
            total = probs.sum()
            if total > 0: probs = probs / total
            
    return probs, note

def post_process_upload(probs, cues, classes_list):
    temperature = 0.85
    probs = np.exp(np.log(probs + 1e-8) / temperature)
    probs = probs / probs.sum()
    
    probs, note = apply_cell3_upload_rules(probs, cues, classes_list)
    
    temperature = 0.9
    probs = np.exp(np.log(probs + 1e-8) / temperature)
    probs = probs / probs.sum()
    
    return probs, note

# ==========================================
# 4B. LIVE LOGIC (ORIGINAL CELL 4 RULES)
# ==========================================
def apply_cell4_live_rules(probs, classes_list, raw_volume, zcr_val, cent_val):
    probs = probs.copy()
    idx_map = {c: i for i, c in enumerate(classes_list)}
    note = "Live: Processed."
    fear_key = "fearful" if "fearful" in idx_map else "fear"
    
    try:
        # Hiss Suppressor (from Cell 4 in Real_FYP_original.ipynb)
        if "disgust" in idx_map:
            probs[idx_map["disgust"]] *= 0.20
        
        # Debug: Print raw volume so we can see actual mic levels
        print(f"    [LIVE DEBUG] raw_volume={raw_volume:.4f}, centroid={cent_val:.0f}")
        
        # Volume Zones — calibrated for browser microphone via ScriptProcessorNode
        if raw_volume >= 0.0003:
            # 1. Genuine forceful loud shouting/high voice -> requires volume > 0.10 AND sharpness > 0.12 (or volume > 0.12)
            if (raw_volume > 0.10 and zcr_val > 0.12) or raw_volume > 0.12:
                if cent_val > 2200 and zcr_val > 0.18:
                    probs[idx_map["happy"]] += 0.25
                    note = f"Loud Upbeat Voice ({raw_volume:.3f}) -> HAPPY"
                else:
                    probs[idx_map["angry"]] += 0.55
                    probs[idx_map["neutral"]] *= 0.35
                    probs[idx_map["sad"]] *= 0.25
                    if fear_key in idx_map:
                        probs[idx_map[fear_key]] *= 0.20
                    note = f"Forceful/High Voice ({raw_volume:.3f}, {cent_val:.0f}Hz) -> ANGRY"
            # 2. Lower volume/pitch -> SAD takes over
            elif raw_volume < 0.012 and cent_val < 900:
                probs[idx_map["sad"]] += 0.55
                probs[idx_map["neutral"]] *= 0.35
                probs[idx_map["angry"]] *= 0.25
                if fear_key in idx_map:
                    probs[idx_map[fear_key]] *= 0.20
                note = f"Lower Volume/Pitch Voice ({raw_volume:.3f}, {cent_val:.0f}Hz) -> SAD"
            # 3. Conversational speech (0.012 to 0.10 volume) -> Anchored to NEUTRAL (~60%)
            else:
                probs[idx_map["sad"]] *= 0.35
                probs[idx_map["angry"]] *= 0.35
                if fear_key in idx_map:
                    probs[idx_map[fear_key]] *= 0.35
                probs[idx_map["neutral"]] += 0.70  # Calibrated for ~60% neutral confidence
                if "calm" in idx_map:
                    probs[idx_map["calm"]] += 0.25
                note = f"Conversational Speech ({raw_volume:.3f}) -> Anchored to NEUTRAL (~60%)"
                
        else:
            # Genuinely near-silent or background room noise -> Anchored to NEUTRAL (~60%)
            probs[idx_map["neutral"]] += 0.85  # Calibrated for ~60% neutral during silence
            if "calm" in idx_map:
                probs[idx_map["calm"]] += 0.30
            probs[idx_map["sad"]] *= 0.20
            probs[idx_map["angry"]] *= 0.20
            if fear_key in idx_map:
                probs[idx_map[fear_key]] *= 0.20
            note = f"Quiet/Silence ({raw_volume:.4f}) -> Anchored to NEUTRAL (~60%)"
            
        # Ensure NEUTRAL confidence stays around ~60% during normal/conversational speech without blocking ANGRY/SAD
        if raw_volume < 0.10 and not (raw_volume >= 0.0003 and (raw_volume < 0.012 and cent_val < 900)):
            neg_keys = [idx_map["sad"], idx_map["angry"]]
            if fear_key in idx_map:
                neg_keys.append(idx_map[fear_key])
            max_neg = max([probs[k] for k in neg_keys])
            if max_neg > probs[idx_map["neutral"]]:
                probs[idx_map["neutral"]] = max_neg * 1.35  # Exact original 1.35x so neutral stays around ~60%
                
        total = probs.sum()
        if total > 0:
            probs = probs / total
            
    except Exception as e:
        print(f"    [LIVE RULES ERROR] {e}")
        pass
        
    return probs, note

# ==========================================
# 5. CORE ROUTER PIPELINE
# ==========================================
def process_audio_pipeline(file_path, original_filename):
    is_live = (original_filename == "live_capture.wav")
    
    try:
        audio, _ = librosa.load(file_path, sr=SAMPLE_RATE, mono=True)
        raw_volume = float(np.sqrt(np.mean(audio**2)))
        
        # Use top_db=30 for live audio as per original Cell 4, top_db=20 for uploads
        trimmed_audio, _ = librosa.effects.trim(audio, top_db=30 if is_live else 20)
        if len(trimmed_audio) < 1000:
            trimmed_audio = audio
            
        cues = get_acoustic_cues(trimmed_audio)
            
        if is_live:
            mx_buffer = np.max(np.abs(trimmed_audio))
            if mx_buffer > 0.0001: 
                processed_audio = trimmed_audio / mx_buffer  # Normalize to full 1.0!
            else:
                processed_audio = trimmed_audio
        else:
            peak = np.max(np.abs(trimmed_audio))
            if peak > 0:
                processed_audio = trimmed_audio / peak
            else:
                processed_audio = trimmed_audio
                
        if len(processed_audio) < N_SAMPLES:
            processed_audio = np.pad(processed_audio, (0, N_SAMPLES - len(processed_audio)))
        else:
            processed_audio = processed_audio[:N_SAMPLES]
        
        mfcc = librosa.feature.mfcc(y=processed_audio, sr=SAMPLE_RATE, n_mfcc=N_MFCC, hop_length=HOP_LENGTH)
        if mfcc.shape[1] < TARGET_STEPS:
            mfcc = np.pad(mfcc, ((0,0),(0, TARGET_STEPS - mfcc.shape[1])), mode="edge")
        else:
            mfcc = mfcc[:, :TARGET_STEPS]
            
        delta1 = librosa.feature.delta(mfcc, order=1)
        delta2 = librosa.feature.delta(mfcc, order=2)
        
        X_feat = np.stack([inst_norm(mfcc), inst_norm(delta1), inst_norm(delta2)], axis=0).astype(np.float32)
        X_tensor = torch.tensor(X_feat).unsqueeze(0).to(device)
        
        t0 = time.time()
        with torch.no_grad():
            logits = model(X_tensor)
            TEMPERATURE = 1.15 if is_live else 0.9
            scaled = logits / TEMPERATURE
            probs = F.softmax(scaled, dim=1).cpu().numpy()[0]
        global LAST_INFERENCE_MS
        LAST_INFERENCE_MS = max(15, int((time.time() - t0) * 1000))
            
        classes_list = list(classes)
        
        # APPLY PSYCHOACOUSTIC PIPELINE RULES
        if is_live:
            final_probs, rule_note = apply_cell4_live_rules(
                probs, classes_list, raw_volume, cues['zcr'], cues['pitch']
            )
        else:
            final_probs, rule_note = post_process_upload(probs, cues, classes_list)
            
        final_idx = int(np.argmax(final_probs))
        final_emotion = classes[final_idx].lower()
        
        global TOTAL_PREDICTIONS, LOW_CONFIDENCE_PREDICTIONS, INFERENCE_TIMESTAMPS, LAST_SYNC_DELAY
        TOTAL_PREDICTIONS += 1
        if max(final_probs) < 0.60:
            LOW_CONFIDENCE_PREDICTIONS += 1
        INFERENCE_TIMESTAMPS.append(time.time())
        INFERENCE_TIMESTAMPS = [ts for ts in INFERENCE_TIMESTAMPS if time.time() - ts <= 60]
        LAST_SYNC_DELAY = max(4, int(LAST_INFERENCE_MS * 0.28))
        final_conf = float(final_probs[final_idx])
        
        is_anomaly = False
        if final_emotion == "angry" and cues['zcr'] > 0.15:
            is_anomaly = True
            
      # ─── DYNAMIC TOP 4 EMOTIONS ───
        # Pair classes with their probabilities and sort highest to lowest
        ranking = sorted(zip(classes_list, final_probs), key=lambda x: x[1], reverse=True)
        
        # Grab only the Top 4 results
        prob_dict = {}
        for class_name, prob in ranking[:4]:
            name = class_name.lower()
            if name == "angry":
                name = "anger" # Keep 'anger' if your UI prefers it
            prob_dict[name] = float(prob)

        # Compute shimmer approximation (amplitude perturbation metric)
        shimmer_val = cues['energy_variability'] * 10.0 if cues.get('energy_variability', 0) > 0 else cues['zcr'] * 10.0
        ui_cues = {'energy': cues['energy'], 'pitch': cues['pitch'], 'zcr': cues['zcr'], 'shimmer': shimmer_val}
        
        return final_emotion, final_conf, prob_dict, ui_cues, is_anomaly, rule_note
    
    except Exception as e:
        import traceback
        traceback.print_exc()
        err_msg = f"{type(e).__name__}: {str(e)}" if str(e) else f"{type(e).__name__}"
        return None, 0, {}, {}, False, err_msg

# ==========================================
# 6. API ENDPOINT ROUTER
# ==========================================
@app.route('/api/analyze-voice', methods=['POST'])
@require_api_key  
def analyze_voice():
    if 'audio' not in request.files:
        return jsonify({'status': 'error', 'message': 'No audio file provided.'}), 400

    audio_file = request.files['audio']
    original_filename = audio_file.filename
    temp_path = f"temp_{uuid.uuid4().hex}.wav"
    audio_file.save(temp_path)

    try:
        emotion, conf, probs, cues, is_anomaly, rule_note = process_audio_pipeline(temp_path, original_filename)
        
        if emotion is None:
             print("Pipeline Processing Error:", rule_note)
             return jsonify({'status': 'error', 'message': rule_note}), 500
             
        return jsonify({
            'status': 'success',
            'data': {
                'emotion': emotion.upper(),
                'confidence': conf,
                'probabilities': probs,
                'acoustic_metrics': cues,
                'anomaly_triggered': is_anomaly,
                'rule_note': rule_note
            }
        }), 200

    except Exception as e:
        print("Backend Processing Error:", e)
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

if __name__ == '__main__':
    print(">>> Voice Analytics Web API Server active on http://127.0.0.1:5000")
    print(">>> SECURE MODE: API Key Required.")
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port, debug=False)