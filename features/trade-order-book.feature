@plan:smoke
Feature: Trade order book — selected view

  # First-time-operator pilot (Story 5-2): select the Order Book tab on the
  # Trade page and verify it becomes the selected view. Read-only scope — no
  # order execution, no numeric bid/ask value assertions. BTC/USD only.
  #
  # NOTE (operator precondition): the Order Book tab must be present in the
  # Favorites bar before the run. The "+"-add action is non-idempotent and is
  # excluded from plan steps — it is an operator run-protocol precondition
  # (see docs/usage.md §1). The scenario selects the existing tab (idempotent:
  # clicking the active tab leaves it selected) and asserts the view-selected
  # postcondition.

  Scenario: Selecting the Order Book tab shows the BTC/USD board
    Given I am on the Trade page for BTC/USD
    When I select the Order book tab in the Favorites bar
    Then the selected view reads "Order book"
    And the URL remains on the Trade page
