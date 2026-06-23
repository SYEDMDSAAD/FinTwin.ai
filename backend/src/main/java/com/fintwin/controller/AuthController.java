package com.fintwin.controller;

import com.fintwin.dto.LoginRequest;
import com.fintwin.dto.RegisterRequest;
import com.fintwin.dto.AuthResponse;
import com.fintwin.dto.GoogleLoginRequest;
import com.fintwin.dto.UserMeDTO;
import com.fintwin.service.AuthService;

import jakarta.validation.Valid;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    @Autowired
    private AuthService authService;

    // =========================
    // REGISTER
    // =========================

    @PostMapping("/register")
    public ResponseEntity<?> register(
            @Valid @RequestBody RegisterRequest request
    ) {

        return ResponseEntity.ok(
            authService.register(request)
        );    
    }

    // =========================
    // LOGIN
    // =========================

    @PostMapping("/login")
    public ResponseEntity<?> login(
            @Valid @RequestBody LoginRequest request
    ) {
        return ResponseEntity.ok(
                authService.login(request)
        );
    }

    // =========================
    // GOOGLE LOGIN
    // =========================

    @PostMapping("/google")
    public AuthResponse googleLogin(

            @RequestBody
            GoogleLoginRequest request

    ) {

        return authService.googleLogin(

                request.getCredential()
        );
    }

    // =========================
    // GET CURRENT USER
    // =========================

    @GetMapping("/me")
    public UserMeDTO me() {
        return authService.getMe();
    }
}