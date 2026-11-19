Feature: Live background data sync and self-service coordinator controls
  As an Event Coordinator
  I want the dashboard to stay fresh automatically while letting me filter events, toggle deduplication, or upload a local CSV
  So that I can monitor live sign-ups hands-free or inspect ad-hoc exports without needing developer support

  Background:
    Given the dashboard is open in a web browser
    And the initial data has loaded from "public/events.json" and "public/registrations.csv"

  Scenario: Automatically refresh registration data every 60 seconds without stale caching
    Given the dashboard displays the "Last synced" timestamp in the header
    When 60 seconds elapse
    Then the dashboard should re-fetch "events.json" and "registrations.csv" with a cache-busting query parameter
    And recalculate all KPI rollups, progress bars, and attention statuses
    And update the "Last synced" timestamp to reflect the latest sync time

  Scenario: Toggle duplicate submission filtering to compare clean vs. raw counts
    Given "registrations.csv" contains 10 duplicate double-submissions alongside 135 unique registrations
    And the "Remove duplicate submissions" toggle is enabled by default
    When the coordinator unchecks the "Remove duplicate submissions" toggle
    Then the dashboard should immediately recalculate using all 145 raw rows
    And update event "E101" Accepted count from 36 to 40
    And update the Data Hygiene KPI card to indicate duplicates are currently included
    When the coordinator re-enables the toggle
    Then the dashboard should revert to the deduplicated count of 36 Accepted for "E101"

  Scenario: Upload a newly exported CSV file directly in the browser for ad-hoc inspection
    Given a coordinator has downloaded a fresh CSV export "registrations-latest.csv" on their computer
    When they select "registrations-latest.csv" via the "Upload New CSV" control
    Then the dashboard should parse the uploaded file locally in the browser without requiring a server redeploy
    And update all live-tracked event cards and KPIs using the uploaded rows
    And update the header status to show the loaded filename "registrations-latest.csv"
    And pause background polling so the manual upload is not overwritten by the 60-second auto-refresh

  Scenario Outline: Filter event cards by operational status tab
    Given the dashboard has loaded events across "Needs Attention", "On Track", and "Completed" states
    When the coordinator clicks the "<tab_name>" filter tab
    Then only events matching "<filter_rule>" should be displayed in the event grid
    And the active tab button should be visually highlighted

    Examples:
      | tab_name          | filter_rule                                                    |
      | All Events        | Every event from events.json                                   |
      | Needs Attention   | Upcoming events flagged as Urgent or Behind target             |
      | Live CSV Tracked  | Events that have matching rows in registrations.csv            |
      | Completed         | Events whose scheduled date is in the past                     |

  Scenario: Handle an invalid or empty manual CSV upload gracefully
    Given a coordinator selects a malformed or empty file via "Upload New CSV"
    When the CSV parser detects zero valid registration rows
    Then the dashboard should display a clear, non-technical error banner
    And preserve the previously loaded dashboard data instead of rendering a blank screen