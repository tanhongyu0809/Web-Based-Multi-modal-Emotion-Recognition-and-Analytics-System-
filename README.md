# FYP Emotion Recognition System

A full-stack **real-time emotion recognition system** built with **Next.js** (frontend) and **FastAPI + PyTorch** (backend). The system uses deep learning models (ResNet34 & ResNet152) to detect and classify facial emotions from uploaded images or live webcam streams.

---

## 📁 Project Structure

```
FYP_Emotion_System/
├── emotion-frontend/        # Next.js 16 web application
│   ├── app/                 # App Router pages & API routes
│   │   ├── admin/           # Admin panel
│   │   ├── dashboard/       # Main dashboard
│   │   ├── login/           # Login page
│   │   ├── register/        # Registration page
│   │   ├── reset-password/  # Password reset
│   │   ├── help/            # Help page
│   │   ├── api/             # API routes (Stripe, etc.)
│   │   └── utils/           # Utility functions
│   ├── package.json
│   └── .env.local           # Environment variables (not committed to git)
│
├── emotion-backend/         # FastAPI Python backend
│   ├── main.py              # API server with emotion detection logic
│   ├── requirements.txt     # Python dependencies
│   ├── best_emotion_model_adamw.pth    # ResNet34 model weights (~85MB)
│   └── best_resnet152_model.pth        # ResNet152 model weights (~710MB)
│
└── README.md                # This file
```

---

## ⚙️ Prerequisites

Make sure you have the following installed before proceeding:

| Software   | Version     | Download Link                                      |
| ---------- | ----------- | -------------------------------------------------- |
| **Node.js** | v20 LTS or above | [https://nodejs.org](https://nodejs.org)       |
| **Python**  | 3.11 or 3.12     | [https://python.org/downloads](https://python.org/downloads) |
| **Git**     | Latest           | [https://git-scm.com](https://git-scm.com)    |

> **⚠️ Important (Python):** During Python installation, make sure to check **"Add Python to PATH"**.

---

## 🚀 Getting Started

### 1. Clone / Download the Project

```bash
git clone <your-repo-url>
cd FYP_Emotion_System
```

Or simply download and extract the ZIP file.

---

### 2. Backend Setup (FastAPI + PyTorch)

Open a terminal and navigate to the backend folder:

```bash
cd emotion-backend
```

#### 2.1 Create a Virtual Environment

```bash
python -m venv venv
```

#### 2.2 Activate the Virtual Environment

**Windows (PowerShell):**
```bash
.\venv\Scripts\Activate.ps1
```

**Windows (Command Prompt):**
```bash
venv\Scripts\activate.bat
```

**macOS / Linux:**
```bash
source venv/bin/activate
```

> You should see `(venv)` appear at the beginning of your terminal prompt.

#### 2.3 Install Python Dependencies

```bash
pip install -r requirements.txt
```

> **Note:** PyTorch (`torch` and `torchvision`) are large packages (~2GB+). The installation may take several minutes depending on your internet speed.

#### 2.4 Verify Model Weight Files

Make sure these two model files exist in the `emotion-backend/` directory:

- `best_emotion_model_adamw.pth` (~85 MB)
- `best_resnet152_model.pth` (~710 MB)

> These files are too large for Git. If they are missing, obtain them from the project owner.

#### 2.5 Start the Backend Server

```bash
uvicorn main:app --reload
```

The backend API will start at: **http://localhost:8000**

You should see output like:
```
Initializing Models...
Loading ResNet34 (AdamW)...
Loading ResNet152...
Loading OpenCV Face Detector...
INFO:     Uvicorn running on http://127.0.0.1:8000
```

---

### 3. Frontend Setup (Next.js)

Open a **new/separate terminal** and navigate to the frontend folder:

```bash
cd emotion-frontend
```

#### 3.1 Install Node.js Dependencies

```bash
npm install
```

#### 3.2 Set Up Environment Variables

Create a `.env.local` file in the `emotion-frontend/` directory with the following variables:

```env
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
NEXT_PUBLIC_GEMINI_API_KEY=<your-gemini-api-key>
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=<your-stripe-publishable-key>
STRIPE_SECRET_KEY=<your-stripe-secret-key>
```

> **⚠️ Important:** Get the actual values from the project owner. Never commit API keys to Git.

#### 3.3 Start the Frontend Dev Server

```bash
npm run dev
```

The frontend will start at: **http://localhost:3000**

You should see:
```
▲ Next.js 16.2.9 (Turbopack)
- Local:   http://localhost:3000
✓ Ready in ~1s
```

---

## ✅ Running the Full System

You need **both servers running simultaneously** in separate terminals:

| Service  | Terminal | Command                  | URL                    |
| -------- | -------- | ------------------------ | ---------------------- |
| Backend  | Terminal 1 | `uvicorn main:app --reload` | http://localhost:8000 |
| Frontend | Terminal 2 | `npm run dev`            | http://localhost:3000   |

1. Start the **backend first** (it needs time to load the models).
2. Then start the **frontend**.
3. Open **http://localhost:3000** in your browser.

---

## 🧠 Available API Endpoints (Backend)

| Method    | Endpoint              | Description                        |
| --------- | --------------------- | ---------------------------------- |
| `POST`    | `/api/analyze/static` | Upload an image for emotion analysis |
| `WebSocket` | `/ws/analyze/live`  | Real-time webcam emotion stream    |
| `POST`    | `/api/model/switch`   | Switch between ResNet34 & ResNet152 |
| `GET`     | `/api/model/current`  | Get the currently active model     |

---

## 🔧 Tech Stack

### Frontend
- **Next.js 16** — React framework with App Router
- **React 19** — UI library
- **Tailwind CSS 4** — Utility-first CSS
- **Supabase** — Authentication & database
- **Stripe** — Payment processing
- **Lucide React** — Icon library
- **React Webcam** — Webcam capture for live analysis

### Backend
- **FastAPI** — High-performance Python web framework
- **PyTorch** — Deep learning framework
- **TorchVision** — Pre-trained ResNet models
- **OpenCV** — Face detection (Haar Cascade)
- **Pillow** — Image processing
- **Uvicorn** — ASGI server

---

## ❓ Troubleshooting

### `node` / `npm` is not recognized
→ Node.js is not installed or not in PATH. Reinstall from [nodejs.org](https://nodejs.org) and restart your terminal.

### `python` is not recognized
→ Python is not installed or not in PATH. Reinstall from [python.org](https://python.org) and make sure to check **"Add Python to PATH"**.

### `pip install` fails for PyTorch
→ If you have a GPU, install the CUDA version instead:
```bash
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
```
For CPU-only:
```bash
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
```

### PowerShell script execution is disabled
→ If you get an error activating the virtual environment, run:
```bash
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Frontend can't connect to backend
→ Make sure the backend is running on `http://localhost:8000` before starting the frontend.

---

## 📝 Notes

- The `.env.local` file contains sensitive API keys and should **never** be committed to Git.
- The model weight files (`.pth`) are large and should be shared via file transfer, not Git.
- Make sure to add both `.env.local` and `.pth` files to your `.gitignore`.
