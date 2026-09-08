@plan:smoke
Feature: History ledger filter

  # First-time-operator pilot (Story 5-1): filter the History ledger by asset.
  # The filter is a contract within the historyMain state (URL unchanged), so
  # these scenarios live on the ledger page rather than under a Home page menu.
  #
  # NOTE (further discussion during triage): the asset list asserted in the
  # first scenario is meant to be shared with the second scenario ("check every
  # asset in the list"). The current model has no parameter slot shared across
  # scenarios, so the list is written inline; see the pilot backlog entry.

  Scenario: Open the assets filter
    Given I am on the History ledger page
    When I open the Assets filter
    Then the filter shows checkboxes for each asset, including "Bitcoin (BTC)" and "Ethereum (ETH)"

  Scenario: Checking a filter asset narrows the ledger
    Given I am on the History ledger page
    When I check the "Bitcoin (BTC)" asset in the Assets filter
    Then the ledger lists only rows whose Asset is "Bitcoin"

  Scenario: Paginating to the next ledger page
    Given I am on the History ledger page
    When I click the next page control
    Then the ledger shows the next page of rows
    And the pager advances by one page