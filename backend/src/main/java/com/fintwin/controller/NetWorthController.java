package com.fintwin.controller;

import com.fintwin.dto.NetWorthResponseDTO;
import com.fintwin.service.NetWorthService;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/net-worth")
public class NetWorthController {

    @Autowired
    private NetWorthService netWorthService;

    @GetMapping
    public NetWorthResponseDTO getNetWorth() {

        return netWorthService.getNetWorth();
    }
}