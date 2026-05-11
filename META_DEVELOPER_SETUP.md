# Meta Developer Setup Notes

Last updated: 2026-05-11

This file records the Meta developer setup completed for Briefly Social so the app IDs, configuration IDs, URLs, and remaining setup work are easy to find later.

## Meta App

- App name: `Briefly Social`
- App ID: `1416874220210243`
- Business portfolio: `Briefly Social`
- Business portfolio ID: `1532500618244512`
- App status at setup time: `Unpublished`
- Contact email: `solutionnyx@gmail.com`
- Category: `Business and pages`

## Use Cases Added

- `Manage messaging & content on Instagram`
- `Manage everything on your Page`

## Basic App Settings Configured

- App domain: `brieflysocial.netlify.app`
- Website platform URL: `https://brieflysocial.netlify.app`
- Privacy Policy URL: `https://brieflysocial.netlify.app/privacy`
- Terms of Service URL: `https://brieflysocial.netlify.app/terms`
- User Data Deletion URL: `https://brieflysocial.netlify.app/data-deletion`

Not configured yet:

- App icon
- Business verification for the `Briefly Social` portfolio

Note: the public legal pages were added in code on 2026-05-11. Deploy the frontend before pasting these URLs into Meta, then verify each URL opens without login.

## Facebook Login for Business

- Product/config area: `Facebook Login for Business`
- OAuth settings URL path: `/business-login/settings/`
- Production OAuth redirect URI added:
  - `https://socialapp1-c83bcf63dc0d.herokuapp.com/api/social/meta/callback`

## Business Login Configuration

- Configuration name: `Briefly Publishing`
- Configuration ID: `1438774668003825`
- Login variation: `General`
- Access token type: `System-user access token`
- Assets selected:
  - `Pages`
  - `Instagram accounts`
- Permissions exposed and selected in Meta's configuration flow:
  - `business_management`
  - `pages_show_list`

Note: Meta showed the `Instagram Graph API` login variation as disabled during setup, so the configuration was created with `General`. Publishing-specific permissions such as `instagram_content_publish`, `pages_manage_posts`, `pages_read_engagement`, and insights permissions still need to be handled through the app implementation and Meta App Review/access flow.

## Production URLs

- Frontend: `https://brieflysocial.netlify.app`
- Privacy Policy: `https://brieflysocial.netlify.app/privacy`
- Terms of Service: `https://brieflysocial.netlify.app/terms`
- Data Deletion Instructions: `https://brieflysocial.netlify.app/data-deletion`
- Backend API: `https://socialapp1-c83bcf63dc0d.herokuapp.com`
- Meta OAuth callback target:
  - `https://socialapp1-c83bcf63dc0d.herokuapp.com/api/social/meta/callback`

## External Website / Meta Dashboard Steps

1. Deploy the frontend so `/privacy`, `/terms`, and `/data-deletion` are live on Netlify.
2. Open Meta Developer Dashboard > App Settings > Basic.
3. Set:
   - Privacy Policy URL: `https://brieflysocial.netlify.app/privacy`
   - Terms of Service URL: `https://brieflysocial.netlify.app/terms`
   - User Data Deletion URL: `https://brieflysocial.netlify.app/data-deletion`
4. Add an app icon for Briefly Social.
5. Save changes and confirm Meta accepts the URLs without warnings.

## Required Environment Variables

Add these to the backend environment when implementation starts:

```env
META_APP_ID=1416874220210243
META_APP_SECRET=<get from Meta App Settings > Basic; do not commit>
META_BUSINESS_LOGIN_CONFIG_ID=1438774668003825
META_GRAPH_API_VERSION=v24.0
META_OAUTH_REDIRECT_URL=https://socialapp1-c83bcf63dc0d.herokuapp.com/api/social/meta/callback
SOCIAL_TOKEN_ENCRYPTION_KEY=<generate a strong secret; do not commit>
META_WEBHOOK_VERIFY_TOKEN=<generate a strong secret if webhooks are added>
```

## Important Security Notes

- The Meta app secret was not copied into this repository.
- Do not commit real secrets to git.
- Store Meta tokens encrypted at rest.
- Scope all connected Meta assets and tokens to the correct Briefly Social workspace/client.
- Rotate tokens and remove access when a client disconnects their account.

## Remaining Before Real Client Launch

1. Deploy the public Privacy Policy, Terms of Service, and Data Deletion URLs, then paste them into Meta App Settings.
2. Implement backend OAuth start/callback routes.
3. Store connected Facebook Pages and Instagram accounts per workspace.
4. Implement encrypted token storage and token refresh/exchange handling.
5. Build publish/schedule APIs and scheduler worker.
6. Add a connection UI for clients to connect their own Facebook/Instagram accounts.
7. Test with an app admin/tester and a connected Facebook Page + Instagram Professional account.
8. Submit required permissions/features for Meta App Review.
9. Complete business verification/access verification when Meta requires it.
10. Add performance sync later for insights and post metrics.
11. Add ads setup later as a separate stage with Marketing API permissions such as `ads_read` and `ads_management`.

## Notes From Setup

- The app was created in the Gupta Payal Chrome profile/session.
- Meta showed no required actions immediately after setup.
- The `Briefly Social` business portfolio appeared as unverified during app creation.
- Ads were intentionally left out of the first configuration to keep the initial publishing flow smaller.
