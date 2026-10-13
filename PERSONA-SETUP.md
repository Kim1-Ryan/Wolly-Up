# Persona identity verification

Create a Persona account and an inquiry template with government ID and selfie checks. Configure a workflow to approve successful inquiries; a completed inquiry alone does not grant a badge.

Add these server-only settings to your ignored `.env` file:

```
PERSONA_API_KEY=your_sandbox_api_key
PERSONA_TEMPLATE_ID=itmpl_your_template
PERSONA_ENVIRONMENT=sandbox
```

Restart the API, sign in again, and start verification from your own profile. Use Persona sandbox test data. Return to Wolly Up and check the result. Sandbox approval is labeled test only and never grants the public verified badge.

For live verification, configure a production template and production API key, then set PERSONA_ENVIRONMENT=production. Verify your template's supported countries and documents in Persona. Credentials must stay on the server.

Wolly Up creates an inquiry bound to the signed-in account, sends the user to Persona Hosted Flow, and retrieves the result directly from Persona on return/focus or manual refresh. It only grants a badge for an approved production inquiry. It stores the inquiry ID, status, and environment; identity documents remain with Persona.

There is no webhook endpoint in this integration. Results refresh when the user returns or checks status. Existing accounts must sign in again to obtain the verification session. The rest of the app's existing account-ID-based endpoints still require a separate authentication hardening pass before public deployment.

Documentation: https://docs.withpersona.com/tutorial-hosted-flow-unique-api
