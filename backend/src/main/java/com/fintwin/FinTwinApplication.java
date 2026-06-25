package com.fintwin;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cache.annotation.EnableCaching;

@SpringBootApplication
@EnableCaching
public class FinTwinApplication {

    public static void main(String[] args) {

        SpringApplication.run(
                FinTwinApplication.class,
                args
        );
    }
}