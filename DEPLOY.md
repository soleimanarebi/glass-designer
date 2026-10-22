# Deploying Glass Designer

Two Netlify sites are deployed from one repository:

| Site | What it is | Netlify setting | Config |
| --- | --- | --- | --- |
| Checker | `apps/app`, the React and three.js checker | package directory `apps/app` | `apps/app/netlify.toml` |
| Landing | `apps/site`, the static landing page with the contact form | package directory `apps/site` | `apps/site/netlify.toml` |

Each `netlify.toml` runs the tests before it builds, so a deploy fails when a test fails.

## 0. Before the first deploy

1. Fill in the operator name and contact address in `apps/site/privacy.html`. Search for `class="todo"`.
2. Confirm the retention period in the privacy notice (it says 12 months) matches what you will actually do.
3. Run everything locally and check it (see "Run locally" below):
   ```sh
   pnpm install
   pnpm test
   pnpm typecheck
   pnpm build
   ```

## 1. Put the code on GitHub

```sh
git remote add origin git@github.com:<owner>/<repo>.git
git push -u origin main
```

## 2. Create the checker site

1. In Netlify, choose **Add new site → Import an existing project → GitHub**, then pick the repository.
2. Leave **Base directory** empty and set **Package directory** to `apps/app`. Leave the build command and publish directory empty so `apps/app/netlify.toml` supplies them:
   - Build command: `pnpm --filter @glass/engine --filter @glass/validation --filter @glass/app test && pnpm --filter @glass/app build`
   - Publish directory: `apps/app/dist`
3. Deploy. Netlify reads `packageManager` from the root `package.json` (pnpm 10.28.0) and `NODE_VERSION = 22` from the toml.
4. Optional: under **Domain management**, add a custom domain such as `app.example.com`.
5. Note the site URL. The landing site needs it in the next step.

## 3. Create the landing site

1. **Add new site → Import an existing project → GitHub**, the same repository again.
2. Leave **Base directory** empty and set **Package directory** to `apps/site`. Leave the build command and publish directory empty:
   - Build command: `pnpm --filter @glass/site test && pnpm --filter @glass/site build`
   - Publish directory: `apps/site/dist`
3. Under **Site configuration → Environment variables**, add `VITE_APP_URL` set to the checker URL from step 2, for example `https://app.example.com`. Without it, the "Open the checker" buttons point at `http://localhost:5173`.
4. Deploy. If you added the variable after the first deploy, choose **Deploys → Trigger deploy → Clear cache and deploy site**.

## 4. Turn on the contact form

1. In the landing site, open **Forms** and choose **Enable form detection**, then redeploy. Netlify only detects forms during a build that runs after detection is enabled.
2. After the deploy, a form called `contact` appears under **Forms**.
3. Under **Forms → Form notifications**, add an email notification so new messages reach you.
4. Test it on the live site: send a message with the consent box ticked. You should land on `/thanks.html`, and the message should show under **Forms → contact**.
5. Spam: the hidden `company-website` field is the honeypot (`netlify-honeypot="company-website"`). Netlify drops submissions that fill it in. Netlify's own spam filter is also on by default.

## 5. After deploying

- Open both sites on a phone and a desktop.
- In the checker, load each template and export a PDF report.
- The `Content-Security-Policy` headers in each toml are strict (`script-src 'self'`). If you add analytics or a font service later, extend the policy, or those resources will be blocked.

## Run locally

```sh
pnpm install

# checker app on http://localhost:5173
pnpm --filter @glass/app dev

# landing site on http://localhost:5174
pnpm --filter @glass/site dev

# all tests, typecheck and the validation cases
pnpm test
pnpm typecheck
pnpm --filter @glass/validation validate

# production builds, served locally
pnpm build
pnpm --filter @glass/app preview    # http://localhost:4173
pnpm --filter @glass/site preview   # http://localhost:4174
```

The Netlify form only works on Netlify. When you run the site locally, the form posts to the local preview server, which does not store submissions.
