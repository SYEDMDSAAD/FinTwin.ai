package com.fintwin.service;

import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

@Service
public class EmailService {

    private static final Logger log = LoggerFactory.getLogger(EmailService.class);

    private final JavaMailSender mailSender;

    @Value("${mail.from:FinTwin Support}")
    private String mailFrom;

    @Value("${spring.mail.username:}")
    private String mailUsername;

    @Value("${mail.enabled:false}")
    private boolean mailEnabled;

    public EmailService(JavaMailSender mailSender) {
        this.mailSender = mailSender;
    }

    public boolean isConfigured() {
        return mailEnabled && mailUsername != null && !mailUsername.isBlank();
    }

    public void sendTicketReply(String toEmail, String userName, Long ticketId, String replyBody) {
        if (!isConfigured()) {
            throw new RuntimeException("Email service is not configured. Set MAIL_ENABLED=true and MAIL_USERNAME/MAIL_PASSWORD in .env.");
        }
        try {
            MimeMessage msg = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(msg, true, "UTF-8");
            helper.setFrom(mailUsername, mailFrom);
            helper.setTo(toEmail);
            helper.setSubject("[FinTwin] Response to your support ticket #" + ticketId);
            helper.setText(buildReplyHtml(userName, ticketId, replyBody), true);
            mailSender.send(msg);
            log.info("Ticket reply sent to {} for ticket #{}", toEmail, ticketId);
        } catch (Exception e) {
            log.error("Failed to send ticket reply to {}: {}", toEmail, e.getMessage());
            throw new RuntimeException("Failed to send email: " + e.getMessage());
        }
    }

    public void sendPasswordResetLink(String toEmail, String userName, String resetUrl) {
        if (!isConfigured()) return;
        try {
            MimeMessage msg = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(msg, true, "UTF-8");
            helper.setFrom(mailUsername, mailFrom);
            helper.setTo(toEmail);
            helper.setSubject("[FinTwin] Reset your password");
            helper.setText(buildResetLinkHtml(userName, resetUrl), true);
            mailSender.send(msg);
            log.info("Password reset link sent to {}", toEmail);
        } catch (Exception e) {
            log.error("Failed to send password reset link to {}: {}", toEmail, e.getMessage());
        }
    }

    public void sendVerificationOtp(String toEmail, String userName, String otp) {
        if (!isConfigured()) return;
        try {
            MimeMessage msg = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(msg, true, "UTF-8");
            helper.setFrom(mailUsername, mailFrom);
            helper.setTo(toEmail);
            helper.setSubject("[FinTwin] Verify your email — " + otp);
            helper.setText(buildOtpHtml(userName, otp), true);
            mailSender.send(msg);
            log.info("Verification OTP sent to {}", toEmail);
        } catch (Exception e) {
            log.error("Failed to send verification OTP to {}: {}", toEmail, e.getMessage());
        }
    }

    public void sendPasswordResetEmail(String toEmail, String userName, String tempPassword) {
        if (!isConfigured()) return;
        try {
            MimeMessage msg = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(msg, true, "UTF-8");
            helper.setFrom(mailUsername, mailFrom);
            helper.setTo(toEmail);
            helper.setSubject("[FinTwin] Your temporary password");
            helper.setText(buildPasswordResetHtml(userName, tempPassword), true);
            mailSender.send(msg);
            log.info("Password reset email sent to {}", toEmail);
        } catch (Exception e) {
            log.error("Failed to send password reset email to {}: {}", toEmail, e.getMessage());
            throw new RuntimeException("Failed to send password reset email: " + e.getMessage());
        }
    }

    private String buildPasswordResetHtml(String userName, String tempPassword) {
        String name = (userName != null && !userName.isBlank()) ? userName : "there";
        return """
            <div style="font-family:'DM Sans',system-ui,sans-serif;background:#080a0f;padding:32px;color:#e2e8f0;max-width:600px;margin:0 auto;border-radius:16px;">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:24px;">
                <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#a78bfa,#22d3ee);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;color:#fff;">F</div>
                <span style="font-size:16px;font-weight:800;color:#fff;">FinTwin AI</span>
              </div>
              <h2 style="color:#fff;font-size:20px;font-weight:700;margin:0 0 8px;">Your password has been reset</h2>
              <p style="color:rgba(148,163,184,0.7);margin:0 0 24px;">Hi %s, an administrator has reset your account password.</p>
              <div style="background:rgba(167,139,250,0.08);border:1px solid rgba(167,139,250,0.2);border-radius:12px;padding:20px;margin-bottom:24px;text-align:center;">
                <div style="font-size:11px;font-weight:700;color:rgba(148,163,184,0.5);letter-spacing:0.08em;margin-bottom:8px;">TEMPORARY PASSWORD</div>
                <div style="font-size:22px;font-weight:800;color:#a78bfa;letter-spacing:0.05em;font-family:monospace;">%s</div>
              </div>
              <p style="color:rgba(148,163,184,0.6);font-size:13px;margin:0 0 8px;">Please log in with this temporary password and change it immediately in your account settings.</p>
              <p style="color:rgba(148,163,184,0.4);font-size:11px;margin:0;">If you did not request this reset, please contact support immediately.</p>
            </div>
            """.formatted(name, tempPassword);
    }

    private String buildResetLinkHtml(String userName, String resetUrl) {
        String name = (userName != null && !userName.isBlank()) ? userName : "there";
        return """
            <div style="font-family:'DM Sans',system-ui,sans-serif;background:#080a0f;padding:32px;color:#e2e8f0;max-width:600px;margin:0 auto;border-radius:16px;">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:24px;">
                <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#a78bfa,#22d3ee);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;color:#fff;">F</div>
                <span style="font-size:16px;font-weight:800;color:#fff;">FinTwin AI</span>
              </div>
              <h2 style="color:#fff;font-size:20px;font-weight:700;margin:0 0 8px;">Reset your password</h2>
              <p style="color:rgba(148,163,184,0.7);margin:0 0 24px;">Hi %s, we received a request to reset your FinTwin password.</p>
              <a href="%s" style="display:inline-block;background:linear-gradient(135deg,#a78bfa,#7c3aed);color:#fff;text-decoration:none;padding:14px 28px;border-radius:12px;font-weight:700;font-size:14px;margin-bottom:20px;">Reset Password →</a>
              <p style="color:rgba(148,163,184,0.5);font-size:12px;margin:0 0 6px;">This link expires in 1 hour. If you did not request a reset, you can safely ignore this email.</p>
              <p style="color:rgba(148,163,184,0.4);font-size:11px;word-break:break-all;margin:0;">%s</p>
            </div>
            """.formatted(name, resetUrl, resetUrl);
    }

    private String buildOtpHtml(String userName, String otp) {
        String name = (userName != null && !userName.isBlank()) ? userName : "there";
        return """
            <div style="font-family:'DM Sans',system-ui,sans-serif;background:#080a0f;padding:32px;color:#e2e8f0;max-width:600px;margin:0 auto;border-radius:16px;">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:24px;">
                <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#a78bfa,#22d3ee);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;color:#fff;">F</div>
                <span style="font-size:16px;font-weight:800;color:#fff;">FinTwin AI</span>
              </div>
              <h2 style="color:#fff;font-size:20px;font-weight:700;margin:0 0 8px;">Verify your email</h2>
              <p style="color:rgba(148,163,184,0.7);margin:0 0 24px;">Hi %s, use this code to verify your email address.</p>
              <div style="background:rgba(167,139,250,0.08);border:1px solid rgba(167,139,250,0.2);border-radius:12px;padding:28px;margin-bottom:24px;text-align:center;">
                <div style="font-size:11px;font-weight:700;color:rgba(148,163,184,0.5);letter-spacing:0.1em;margin-bottom:12px;">YOUR VERIFICATION CODE</div>
                <div style="font-size:42px;font-weight:800;color:#a78bfa;letter-spacing:0.18em;font-family:monospace;">%s</div>
              </div>
              <p style="color:rgba(148,163,184,0.5);font-size:12px;margin:0;">This code expires in 10 minutes. If you did not create a FinTwin account, ignore this email.</p>
            </div>
            """.formatted(name, otp);
    }

    private String buildReplyHtml(String userName, Long ticketId, String replyBody) {
        String name = (userName != null && !userName.isBlank()) ? userName : "there";
        return """
            <div style="font-family:'DM Sans',system-ui,sans-serif;background:#080a0f;padding:32px;color:#e2e8f0;max-width:600px;margin:0 auto;border-radius:16px;">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:24px;">
                <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#a78bfa,#22d3ee);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;color:#fff;">F</div>
                <span style="font-size:16px;font-weight:800;color:#fff;">FinTwin AI</span>
              </div>
              <h2 style="color:#fff;font-size:20px;font-weight:700;margin:0 0 8px;">Response to your support ticket #%d</h2>
              <p style="color:rgba(148,163,184,0.7);margin:0 0 24px;">Hi %s, our team has reviewed your request.</p>
              <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-left:3px solid #a78bfa;border-radius:12px;padding:20px;margin-bottom:24px;">
                <p style="color:#e2e8f0;line-height:1.6;margin:0;">%s</p>
              </div>
              <p style="color:rgba(148,163,184,0.5);font-size:12px;margin:0;">If you have further questions, please visit our support page or reply to this email.</p>
            </div>
            """.formatted(ticketId, name, replyBody.replace("\n", "<br>"));
    }
}
