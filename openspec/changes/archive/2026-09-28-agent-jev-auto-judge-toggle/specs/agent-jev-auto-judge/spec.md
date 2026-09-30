## ADDED Requirements

### Requirement: Agent can control whether JEV is included

The Agent configuration MUST provide a persisted JEV switch that supports a global value and a per-profile override. If a stored configuration has no value, the setting MUST default to enabled to preserve existing behavior.

#### Scenario: JEV is enabled

- **WHEN** the effective Agent configuration enables JEV
- **THEN** Agent model requests include the `jev_decide` tool
- **AND** JEV automatically evaluates completion after each batch of page actions

#### Scenario: JEV is disabled

- **WHEN** the effective Agent configuration disables JEV
- **THEN** Agent model requests do not include the `jev_decide` tool
- **AND** page tasks do not automatically call JEV
- **AND** the Agent does not claim that JEV confirmed the result

#### Scenario: A profile overrides the global JEV setting

- **WHEN** a user saves a JEV value for one profile
- **THEN** that profile uses the override and other profiles continue to use the global value
