# JobSwipe 🧠

A Tinder-style job search app. Set your preferences once, then swipe through job cards:

- **Swipe left ✖️** — not interested. The job is remembered and never shown again.
- **Swipe right ❤️** — interested. The job's full details and apply link are **emailed to you** and it's kept in your Saved list.

Jobs are pulled live from **Adzuna** (which aggregates thousands of job boards), **Jooble**, **The Muse**, and **Remotive**, deduplicated and sorted newest-first. A **Boards** tab gives one-tap pre-filled searches on psychology-specific boards (PsycCareers, APS, BPS Jobs, NHS Jobs, PsychologyJobs.com, HigherEdJobs) plus Indeed, LinkedIn, Glassdoor, Reed, Totaljobs, and Google Jobs.

Everything runs in your browser — preferences, seen jobs, and saved jobs are stored on your device. No server, no database, nothing to pay for.

---

## 1. Deploy to GitHub Pages (5 minutes)

Using the browser (no command line needed):

1. Sign in to GitHub with your **rossp318@gmail.com** account.
2. Click **+ → New repository**. Name it `jobswipe`. Set it to **Public**. Click **Create repository**.
3. On the new repo page, click **uploading an existing file**, drag in `index.html` and `README.md`, and click **Commit changes**.
4. Go to **Settings → Pages**. Under *Branch*, choose `main` and `/ (root)`, then **Save**.
5. After ~1 minute your app is live at:
   **`https://<your-github-username>.github.io/jobswipe/`**

Open it on your phone and use "Add to Home Screen" — it behaves like an app.

Command-line alternative:

```bash
cd jobswipe
git init && git add . && git commit -m "JobSwipe"
git branch -M main
git remote add origin https://github.com/<your-username>/jobswipe.git
git push -u origin main
# then enable Pages in repo Settings → Pages → branch: main
```

---

## 2. Get your free Adzuna key (the main job engine — 2 minutes)

The app works without any keys (The Muse + Remotive are keyless), but **Adzuna is where most of the results come from** — it indexes millions of listings across the major boards.

1. Go to <https://developer.adzuna.com> and click **Sign up / Register**.
2. Confirm your email; your **Application ID** and **Application Key** appear on the dashboard.
3. In JobSwipe, open **⚙️ Settings → Job source API keys**, paste both, and save.

Optional extra coverage: a free **Jooble** key from <https://jooble.org/api/about> (they email it to you) goes in the same section.

> Note: with a static app your API keys live in your browser's storage and are visible in network requests. For a personal free-tier key this is normal and low-risk, but don't share your app URL with keys typed in on a shared computer.

---

## 3. Set up automatic emails with EmailJS (5 minutes, free)

EmailJS lets the app send real email from the browser — 200 emails/month free.

1. Create an account at <https://www.emailjs.com>.
2. **Email Services → Add New Service** → choose Gmail (or any provider) and connect the account you want the mail sent *from*. Note the **Service ID** (e.g. `service_abc123`).
3. **Email Templates → Create New Template**. Set:
   - **To email:** `{{to_email}}`
   - **Subject:** `Job match: {{job_title}} at {{company}}`
   - **Content:**

     ```
     You swiped right on:

     {{job_title}}
     {{company}} — {{job_location}}
     Salary: {{salary}}
     Type: {{job_type}}
     Source: {{source}}

     {{description}}

     Apply here: {{apply_url}}

     — JobSwipe
     ```

   Note the **Template ID** (e.g. `template_xyz789`).
4. **Account → General**: copy your **Public Key**.
5. In JobSwipe **⚙️ Settings → Email on right-swipe**, enter the email address you want jobs sent **to**, plus the Service ID, Template ID, and Public Key. Save.

Until EmailJS is configured, right-swipes still save the job and offer a one-tap "email it to yourself" link that opens your mail app pre-filled.

---

## Preferences that shape the search

Keywords/position (comma-separated alternatives), industry, seniority, country, city, search radius, minimum salary, full-time only, and whether to include remote-job boards. Change them any time in ⚙️ Settings — the deck refreshes with the new filters. "Reset seen jobs" clears your swipe history if you want to see passed jobs again.

## Honest limitations

- LinkedIn, Indeed, and Glassdoor have no public APIs, so their listings can't appear as swipe cards; Adzuna covers much of the same inventory, and the Boards tab deep-links you into them with your search pre-filled.
- Psychology niche boards (PsycCareers, BPS, NHS Jobs) also have no public APIs — same approach: one-tap pre-filled searches in the Boards tab.
- Data lives in your browser (localStorage). Clearing site data clears your preferences and saved jobs; different devices don't sync.
