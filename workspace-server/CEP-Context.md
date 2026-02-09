# Chrome Enterprise Premium Extension - Behavioral Guide

This guide provides behavioral instructions for effectively using the Chrome
Enterprise Premium (CEP) Extension tools. For detailed parameter documentation,
refer to the tool descriptions in the extension itself.

## Core Principles

### Safety and Transparency

**Never execute write operations without explicit confirmation:**

- Preview all changes before executing
- Show complete details in a readable format
- Wait for clear user approval
- Give users the opportunity to review and cancel

### Smart Tool Usage

**Choose the right approach for each task:**

- Batch related operations when possible
- Use pagination for large result sets
- Apply appropriate output formats based on the use case

## Output Formatting Standards

### Lists and Search Results

Always format multiple items as **numbered lists** for better readability:

```
Found 3 devices:
1. ASUS Chromebook CX1 - Org Unit: /Engineering
2. HP Chromebook 14 - Org Unit: /Sales
3. Lenovo Chromebook S330 - Org Unit: /Marketing
```

### Write Operation Previews

Before any write operation, show a clear preview:

```
I'll update this org unit policy:

Org Unit: /Engineering
Policy: ScreenBrightnessPercent
New Value: 70

Should I apply this change?
```

## API Coverage

The CEP extension provides access to these Google Admin and security APIs:

### Chrome Management

- **Reports** (readonly): Browser and device telemetry, installed apps,
  extension usage, version distribution
- **Profiles** (readonly): Managed Chrome browser profiles
- **Policy**: Organizational unit and group-based Chrome policy management

### Cloud Identity

- **Policies**: Security and access control policies for the organization

### Admin SDK - Directory

- **Org Units**: Organizational unit hierarchy management
- **Groups**: Google Groups management and membership
- **Users**: User account administration

### Admin SDK - Reports

- **Audit**: Admin audit logs, login events, and activity reports

### eDiscovery (Vault)

- **Matters**: Legal hold and investigation management
- **Exports**: Data export for compliance and legal review

## Error Handling Patterns

### Authentication Errors

- If any tool returns `{"error":"invalid_request"}`, it likely indicates an
  expired or invalid session
- **Action:** Call `auth.clear` to reset credentials and force a re-login
- Inform the user that you are resetting authentication due to an error

### Permission Errors

- CEP APIs require specific admin roles (Super Admin, Groups Admin, etc.)
- If a 403 is returned, explain which admin role is likely needed
- Suggest the user check their Admin Console role assignments

### Graceful Degradation

- If an org unit path doesn't exist, offer to list available org units
- If search returns no results, suggest broadening the query
- If permissions are insufficient, explain clearly what role is needed

## Performance Optimization

### Batch Operations

- Group related API calls when possible
- Use field masks to request only needed data
- Implement pagination for large datasets (device lists, user lists)

### Caching Strategy

- Reuse organizational context throughout the session
- Cache frequently accessed metadata (org unit tree, group listings)
- Minimize redundant API calls

## Common Pitfalls to Avoid

- Do not execute destructive operations (policy changes, user modifications)
  without explicit confirmation
- Do not assume organizational structure; query it first
- Do not ignore pagination; large organizations may have thousands of devices,
  users, or groups
- Do not expose sensitive fields (passwords, recovery keys) in output unless
  the user specifically requests them

Remember: This guide focuses on **how to think** about using these tools
effectively. For specific parameter details, refer to the tool descriptions
themselves. As new CEP tools are added, update this guide with service-specific
behavioral notes.
