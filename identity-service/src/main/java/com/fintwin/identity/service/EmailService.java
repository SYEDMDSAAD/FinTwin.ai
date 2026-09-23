package com.fintwin.identity.service;

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

    @Value("${app.require-secure-config:false}")
    private boolean requireSecureConfig;

    public EmailService(JavaMailSender mailSender) {
        this.mailSender = mailSender;
    }

    public boolean isConfigured() {
        return mailEnabled && mailUsername != null && !mailUsername.isBlank();
    }

    // Whether a verification OTP or password-reset link may be handed back in
    // the API response. That is a local-dev convenience: with no mail provider
    // there is no other way to finish a signup or a reset. In a deployment that
    // declares itself production it is a hole — the response would give the OTP
    // or reset link to whoever typed the address, so anyone could verify, or
    // take over, an account they do not own. There a missing mail config is a
    // deployment mistake, and startup refuses it outright.
    public boolean canRevealSecrets() {
        return !isConfigured() && !requireSecureConfig;
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

    public void sendTemporaryPassword(String toEmail, String userName, String tempPassword) {
        if (!isConfigured()) return;
        try {
            MimeMessage msg = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(msg, true, "UTF-8");
            helper.setFrom(mailUsername, mailFrom);
            helper.setTo(toEmail);
            helper.setSubject("[FinTwin] Your temporary password");
            helper.setText(buildTempPasswordHtml(userName, tempPassword), true);
            mailSender.send(msg);
            log.info("Temporary password sent to {}", toEmail);
        } catch (Exception e) {
            log.error("Failed to send temporary password to {}: {}", toEmail, e.getMessage());
            throw new RuntimeException("Failed to send email: " + e.getMessage());
        }
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
              <p style="color:rgba(148,163,184,0.5);font-size:12px;margin:0;">This code expires in 10 minutes.</p>
            </div>
            """.formatted(name, otp);
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
              <p style="color:rgba(148,163,184,0.5);font-size:12px;margin:0 0 6px;">This link expires in 30 minutes. If you did not request a reset, ignore this email.</p>
            </div>
            """.formatted(name, resetUrl);
    }

    private String buildTempPasswordHtml(String userName, String tempPassword) {
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
              <p style="color:rgba(148,163,184,0.6);font-size:13px;">Please log in and change it immediately in your account settings.</p>
            </div>
            """.formatted(name, tempPassword);
    }
}
