Feature: Clear at-a-glance live registration dashboard
  As a non-technical Events Team member
  I want to open a single live URL and immediately understand registration health across all events
  So that I do not have to inspect spreadsheets or calculate percentages manually

  Scenario: View executive summary and action banner on page load
    Given the web application is deployed and accessible at a public URL
    When a user opens the dashboard in their browser
    Then they should see top-level KPI cards for:
      | KPI Metric                  |
      | Upcoming Confirmed Seats    |
      | Events Needing Attention    |
      | Pending Review (CSV)        |
      | Data Hygiene (Duplicates)   |
    And an "Action Required" alert banner should list all events flagged as needing attention
    And events needing attention should appear before on-track and completed events

  Scenario: Inspect an individual event card with live CSV data
    Given event "E101" ("Sydney Cloud Security Summit") is present in "registrations.csv"
    When the user views the card for "E101"
    Then the card should display the event name, city, date, and days remaining
    And a visual progress bar showing "36 of 60 target (60%)"
    And the remaining gap text "24 more accepted registrations needed"
    And distinct status counts showing "36 Accepted", "2 Pending", and "5 Cancelled"