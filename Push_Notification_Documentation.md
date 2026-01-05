# Push Notification System Documentation

## Overview

This document outlines the complete workflow and logic of the Brand Performance Alert System. The system is designed to monitor hourly sales metrics (specifically Conversion Rate or CVR) and proactively notify stakeholders when performance drops significantly below expected benchmarks.

---

## 1. How It Works (The Workflow)

The system operates on an hourly cycle. Here is the step-by-step journey of an alert:

### Step 1: Data Ingestion

- **Trigger**: Every hour, the data pipeline finishes processing sales data for all brands.
- **Signal**: It sends a signal to the dashboard backend containing the latest `Total Orders` and `Total Sessions` for each brand.
- **Validation**: The system instantly checks these numbers. If they look incorrect (e.g., negative values) or if key information is missing, the signal is rejected to prevent false alarms.
- **Deduplication**: If the same signal is received twice (e.g., due to a network retry), the system processes it only once to ensure users don't receive duplicate notifications.

### Step 2: The Decision Engine

Once valid data is received, the system analyzes performance:

1.  **Historical Comparison**: It compares the _Current Hour's CVR_ against:
    - Yesterday's CVR (at the exact same hour).
    - The 5-Day Average CVR (at the exact same hour).
2.  **State Assessment**: The brand is assigned a "Health State":
    - **Normal**: Performance is stable.
    - **Degraded**: CVR has dropped by more than **15%** compared to benchmarks.
    - **Recovered**: Performance has improved significantly after a drop.

### Step 3: Notification Rules

The system only sends a notification when there is a meaningful change in status:

- **Drop Alert**: Sent when status moves from _Normal_ to _Degraded_.
- **Recovery Alert**: Sent when status moves from _Degraded_ to _Recovered_.
- **Silence**: No notification is sent if the status remains _Normal_ or remains _Degraded_ (to avoid spamming the user every hour).

---

## 2. Notification Features

### A. Intelligent Copy variation

To keep notifications professional and avoid "alert fatigue," the system uses a smart library of message templates.

- **Consistency**: For a specific brand at a specific hour, the message wording is always the same.
- **Variety**: Across different times and brands, the system rotates through 10 different professional phrasings (e.g., _"CVR down 15%"_ vs _"Attention: Performance trailing by 15%"_).

### B. Smart Deep Linking

When a user clicks on a notification:

1.  **Context Awareness**: The link contains the specific **Brand**, **Date**, and **Hour** of the alert.
2.  **Auto-Redirection**: The dashboard loads and automatically selects the correct brand from the dropdown menu, saving the user from searching for it manually.

### C. Real-Time UI Updates

- **The Bell**: If the user is already on the dashboard, the "Notification Bell" lights up instantly with a new badge count, without needing to refresh the page.
- **Interactive Panel**: Users can view a history of alerts, mark all as read, or manually refresh the list.

---

## 3. Safety Mechanisms

### Zero-Metric Protection

If the data pipeline reports "0 Orders and 0 Sessions" (which usually suggests a data sync failure rather than zero sales), the system activates a **System Exception**.

- **Action**: It suppresses CVR alerts to prevent false panic.
- **Resolution**: Once valid data flows again, normal monitoring resumes automatically.

### Security

- **Role-Based Access**: Only users with "Author" (Admin) privileges receive these performance alerts.
- **Data Isolation**: Deep links only work if the user is authorized to view that specific brand.

---

## 4. User Experience Summary

1.  **Receive**: User gets a push alert on their device: _"TMC: CVR down 18% vs yesterday"_.
2.  **Click**: User clicks the alert.
3.  **View**: Dashboard opens, selects "TMC" automatically, and displays the relevant metrics.
4.  **Action**: User investigates the drop using the charts provided.
