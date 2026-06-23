package com.fintwin.dto;

public class AdminStatsDTO {

    private long totalUsers;
    private long activeUsers;
    private long newUsersThisWeek;
    private long adminCount;

    public AdminStatsDTO(
            long totalUsers,
            long activeUsers,
            long newUsersThisWeek,
            long adminCount
    ) {
        this.totalUsers = totalUsers;
        this.activeUsers = activeUsers;
        this.newUsersThisWeek = newUsersThisWeek;
        this.adminCount = adminCount;
    }

    public long getTotalUsers()        { return totalUsers; }
    public long getActiveUsers()       { return activeUsers; }
    public long getNewUsersThisWeek()  { return newUsersThisWeek; }
    public long getAdminCount()        { return adminCount; }
}
