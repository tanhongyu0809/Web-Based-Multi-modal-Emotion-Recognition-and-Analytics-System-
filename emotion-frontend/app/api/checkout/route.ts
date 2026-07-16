import { NextResponse } from 'next/server';
import Stripe from 'stripe';

// Initialize Stripe with your secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: Request) {
  try {
    const { userId, email } = await request.json();

    // Create a Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: email, // Pre-fills their email on the checkout page
      line_items: [
        {
          price_data: {
            currency: 'myr', // Malaysian Ringgit
            product_data: {
              name: 'Affective Computing - Plus Plan',
              description: 'Unlock Expert ResNet-152 Engine & Gemini AI Insights',
            },
            unit_amount: 200, // Stripe expects the amount in cents (100 sen = RM 1.00)
          },
          quantity: 1,
        },
      ],
      mode: 'payment', 
      // Where to send them when they finish (we add ?success=true to the URL)
      success_url: `${request.headers.get('origin')}/dashboard/live?upgrade=success`,
      cancel_url: `${request.headers.get('origin')}/dashboard/live?upgrade=cancelled`,
      metadata: {
        userId: userId, // Keep track of who is upgrading
      }
    });

    // Return the secure Stripe URL to the frontend
    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error("Stripe Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}