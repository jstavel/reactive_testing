Feature: Home page Layout menu

  Scenario: Clicking the layout button reveals the Layout configuration menu
    Given I am on the Kraken Pro home page
    When I click the layout button in the page header
      # unique locator: //button[.//svg[@name="LayoutAdd"]]
    Then the Layout configuration menu appears with the sections:
      | Left Widgets  |
      | Right Widgets |

  Scenario: Clicking the layout button again hides the Layout configuration menu
    Given I am on the Kraken Pro home page
    And the Layout configuration menu is open
    When I click the layout button in the page header
    Then the Layout configuration menu is closed
