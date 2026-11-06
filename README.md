# JPJ SI Website

A responsive, single-page marketing site for **JPJ SI**, an intelligent CRM for government resellers.

## Preview locally

This is a static HTML site—no build tools or dependencies are required.

1. Open the project folder.
2. Double-click `index.html`, or open it with your browser.

## Project structure

```text
JPJ Website/
├── assets/          # Logo, background, and product mockup images
├── index.html       # Page content and interaction script
├── styles.css       # Responsive layout, colors, typography, and effects
└── README.md
```

## Highlights

- Responsive layouts for desktop, tablet, and mobile
- Accessible color palette, focus states, and form labels
- Sticky navigation with in-page section links
- Desktop section-to-section scroll effect
- Dedicated demo section and footer destination

## Publish to GitHub

From the project folder in the Visual Studio Code terminal:

```powershell
git add index.html styles.css assets README.md
git commit -m "Build JPJ SI landing page"
git branch -M main
git remote add origin https://github.com/IreneKuoAZ/jpj-website.git
git push -u origin main
```

If a remote named `origin` has already been added, skip the `git remote add origin` line.
