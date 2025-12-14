import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface EmailRequest {
  transactionId: string;
  walletAddress: string;
  errorMessage: string;
  failedStep?: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { transactionId, walletAddress, errorMessage, failedStep }: EmailRequest = await req.json();

    if (!transactionId || !walletAddress || !errorMessage) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: transactionId, walletAddress, errorMessage" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("📧 Sending alert email for transaction:", transactionId);

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const adminEmail = Deno.env.get("ADMIN_EMAIL") || "trapstarssolana@gmail.com";
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase configuration missing");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const stepNames = [
      "Unknown",
      "Service Fee Payment",
      "Reimbursement Payment",
      "NFT Burn",
      "Metadata Update"
    ];

    const failedStepName = failedStep ? stepNames[failedStep] : "Unknown";

    const emailSubject = `🚨 Transaction Failed - ${transactionId.substring(0, 8)}`;
    const emailBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #dc2626; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
          .info-box { background: white; padding: 15px; margin: 10px 0; border-radius: 4px; border-left: 4px solid #dc2626; }
          .label { font-weight: bold; color: #666; }
          .value { color: #000; word-break: break-all; }
          .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">⚠️ Transaction Failed</h1>
          </div>
          <div class="content">
            <p>A trait swap transaction has failed and requires attention.</p>
            
            <div class="info-box">
              <p><span class="label">Transaction ID:</span><br/>
              <span class="value">${transactionId}</span></p>
            </div>
            
            <div class="info-box">
              <p><span class="label">Wallet Address:</span><br/>
              <span class="value">${walletAddress}</span></p>
            </div>
            
            <div class="info-box">
              <p><span class="label">Failed Step:</span><br/>
              <span class="value">${failedStepName} (Step ${failedStep || 'Unknown'})</span></p>
            </div>
            
            <div class="info-box">
              <p><span class="label">Error Message:</span><br/>
              <span class="value">${errorMessage}</span></p>
            </div>
            
            <div class="info-box">
              <p><span class="label">Timestamp:</span><br/>
              <span class="value">${new Date().toISOString()}</span></p>
            </div>
            
            <a href="https://your-domain.com/admin.html?transaction=${transactionId}" class="button">
              View in Admin Dashboard
            </a>
            
            <p style="margin-top: 30px; color: #666; font-size: 12px;">
              This is an automated alert from Trap Stars Trait Swap System.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    let emailSent = false;
    let sendError = null;

    if (resendApiKey) {
      try {
        console.log("📤 Sending email via Resend...");
        const emailResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Trap Stars Alerts <alerts@trapstars.app>",
            to: [adminEmail],
            subject: emailSubject,
            html: emailBody,
          }),
        });

        if (!emailResponse.ok) {
          const errorText = await emailResponse.text();
          throw new Error(`Resend API error: ${emailResponse.status} - ${errorText}`);
        }

        const emailResult = await emailResponse.json();
        console.log("✅ Email sent successfully:", emailResult);
        emailSent = true;
      } catch (error) {
        console.error("❌ Failed to send email:", error);
        sendError = error.message;
      }
    } else {
      console.warn("⚠️ RESEND_API_KEY not configured, skipping email send");
      sendError = "RESEND_API_KEY not configured";
    }

    const { error: dbError } = await supabase
      .from("email_notifications")
      .insert({
        transaction_id: transactionId,
        recipient_email: adminEmail,
        notification_type: "transaction_failed",
        email_subject: emailSubject,
        email_body: emailBody,
        send_status: emailSent ? "sent" : "failed",
        error_message: sendError,
      });

    if (dbError) {
      console.error("❌ Failed to log email notification:", dbError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        emailSent,
        message: emailSent ? "Email sent successfully" : "Email not sent (API key missing or error)",
        error: sendError,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("❌ Email alert failed:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Failed to send email alert",
        details: error.toString(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});