Feature: Automated weekday morning webhook digest for behind-target events
  As an Events Team Manager
  I want an automated summary of behind-target events posted to our chat webhook every weekday morning
  So that the team starts the workday knowing which events need immediate outreach or approval follow-ups

  Background:
    Given the aggregation script is located at "script/daily-digest.ts"
    And the GitHub Actions workflow is configured at ".github/workflows/morning-alert.yml"
    And the repository secret "SLACK_WEBHOOK" is configured with a valid webhook endpoint URL
    And the script imports the shared deduplication and attention logic from "src/lib/aggregator.ts"

  Scenario: Trigger the alert automatically on weekday mornings in AEDT
    Given the GitHub Actions schedule uses the UTC cron expression "0 21 * * 0-4"
    When the scheduled time reaches 08:00 AM AEDT (Monday through Friday)
    Then GitHub Actions should checkout the repository and execute "script/daily-digest.ts"
    And pass the "SLACK_WEBHOOK" secret as an environment variable to the script

  Scenario: Support manual on-demand execution for verification
    Given a team member or engineer opens the "Actions" tab in GitHub
    When they manually trigger the "workflow_dispatch" event for ".github/workflows/morning-alert.yml"
    Then the workflow should immediately run "script/daily-digest.ts"
    And deliver the morning digest payload to the configured "SLACK_WEBHOOK" URL

  Scenario: Post a prioritized alert payload when upcoming events are behind target
    Given the current reference date is "2026-11-16"
    And "events.json" and "registrations.csv" are reconciled with deduplication enabled
    And the following upcoming events meet the behind-target criteria (within 10 days and under 85% target):
      | event_id | name                         | city      | days_until | confirmed | target | pct | pending |
      | E125     | Identity Leaders Roundtable  | Sydney    | 2          | 36        | 50     | 72  | 4       |
      | E101     | Sydney Cloud Security Summit | Sydney    | 3          | 36        | 60     | 60  | 2       |
      | E126     | Identity Leaders Roundtable  | Melbourne | 3          | 9         | 30     | 30  | 0       |
      | E130     | Network Detection Roundtable | Brisbane  | 3          | 4         | 25     | 16  | 0       |
    When "script/daily-digest.ts" executes
    Then it should send an HTTP POST request with "Content-Type: application/json" to "SLACK_WEBHOOK"
    And the JSON payload should include a human-readable "text" summary listing those 4 events sorted by soonest date first
    And each listed event should show its event ID, name, city, days remaining, confirmed-to-target ratio, and pending count if greater than 0
    And completed past events such as "E114" and on-track events such as "E141" should be excluded from the behind-target list

  Scenario: Post an all-clear confirmation when no events are behind target
    Given all upcoming events within the next 10 days have reached at least 85% of their target registrations
    When "script/daily-digest.ts" executes
    Then it should send an HTTP POST request to "SLACK_WEBHOOK"
    And the payload "text" should confirm that all upcoming events are currently on track

  Scenario: Fail loudly if SLACK_WEBHOOK is missing or returns an HTTP error
    Given the "SLACK_WEBHOOK" environment variable is empty or the endpoint responds with HTTP status 500
    When "script/daily-digest.ts" executes
    Then the script should log the HTTP failure details to stderr
    And exit with a non-zero exit code so GitHub Actions marks the workflow run as failed