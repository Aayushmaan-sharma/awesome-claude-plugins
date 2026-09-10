/* MFL Centre — policy pages.
 *
 * These are working drafts written against what this code actually does:
 * no server, no cookies, no trackers, nothing leaves the browser. The
 * moment you connect a payment provider or a backend, every page here
 * needs revising to match the new behaviour.
 *
 * {{tokens}} are filled from SITE in app.js. Anything you leave blank in
 * SITE renders as a visible "fill this in" marker rather than a lie.
 *
 * This is not legal advice. Have a solicitor read it before you trade.
 */

const POLICIES = {
  terms: {
    nav: "Terms",
    title: "Terms and conditions",
    lede: "The agreement between {{name}} and the people who buy and sell notes here.",
    blocks: [
      {
        h: "Who you are dealing with",
        body: [
          "{{name}} is operated by {{legalName}}, registered in {{country}} with company number {{companyNumber}}. Our registered address is {{address}} and you can reach us at {{contactEmail}}. Our VAT registration number is {{vatNumber}}.",
          "Using this site means you accept these terms. If you do not accept them, do not buy or list anything.",
        ],
      },
      {
        h: "What {{name}} is",
        body: [
          "{{name}} is a marketplace. Sellers write and price their own notes; we host the listing, take payment and deliver the file. The contract for the notes themselves is between the buyer and the seller. We are not the author of the notes and we do not check them for accuracy.",
          "That said, we do remove listings that break these terms, and we act on copyright complaints.",
        ],
      },
      {
        h: "Buying notes",
        body: [
          "Prices shown include VAT where it applies. You pay the price displayed at the moment you check out.",
          "Buying a pack gives you a personal study licence:",
          {
            list: [
              "You may download, read, print and annotate the file for your own study.",
              "You may not resell it, share it, upload it to a file-sharing or note-sharing site, or pass it to anyone else.",
              "The licence lasts as long as we operate the site. It is not a transfer of copyright — the seller keeps that.",
            ],
          },
          "Delivery is immediate: the download unlocks as soon as the order is confirmed. Because of that you are asked to consent to immediate delivery at checkout, which affects your cancellation rights. The refund policy explains exactly how.",
        ],
      },
      {
        h: "Selling notes",
        body: [
          "When you publish a listing you confirm, every time, that:",
          {
            list: [
              "You wrote the notes yourself.",
              "You own the copyright in everything in them, or you have permission to sell it.",
              "They contain no material copied from lecture slides, textbooks, question banks, past papers or another student's work.",
              "They are study material, not an assignment written for someone else to submit.",
              "Nothing in them is confidential, embargoed, or under a non-disclosure agreement with your institution.",
            ],
          },
          "You keep the copyright in your notes. You give us a licence to display, store and deliver them to buyers for as long as the listing is live, and to keep delivering them to people who have already bought.",
          "You are responsible for your own tax. We do not withhold income tax from payouts.",
        ],
      },
      {
        h: "Fees and payouts",
        body: [
          "We take {{feePct}}% of each sale. The rest is yours. The payout figure shown on the listing form is what you keep after our fee, before any tax you owe.",
          "Payouts are paid to the account you register with our payment provider, on the schedule published in your seller settings.",
        ],
      },
      {
        h: "What may not be listed",
        body: [
          "We remove, without notice, listings that contain other people's copyrighted material, completed assignments offered for submission, exam content under embargo, personal data about identifiable people, or anything unlawful.",
          "Repeat infringement ends the seller account.",
        ],
      },
      {
        h: "If something is wrong with a pack",
        body: [
          "Digital content sold to consumers has to be as described, fit for purpose and of satisfactory quality — that is the Consumer Rights Act 2015, and nothing here reduces it. If a pack is not what the listing said it was, tell us and read the refund policy.",
        ],
      },
      {
        h: "Our liability",
        body: [
          "We do not exclude liability for death or personal injury caused by our negligence, for fraud, or for anything else the law does not let us exclude.",
          "Beyond that, we are not liable for your academic results. Notes are a study aid. What you do with them, and what grade follows, is yours.",
        ],
      },
      {
        h: "Changes, law and complaints",
        body: [
          "We may change these terms. Orders already placed are governed by the terms that were live when you placed them.",
          "These terms are governed by the law of {{governingLaw}}, and its courts have jurisdiction.",
          "Complaints go to {{contactEmail}}. We aim to reply within five working days.",
        ],
      },
    ],
  },

  privacy: {
    nav: "Privacy",
    title: "Privacy policy",
    lede: "What this site does with information about you — which, as it currently stands, is very little.",
    blocks: [
      {
        h: "Read this first",
        body: [
          "This build has no server. Everything you type stays in your own browser, and the page makes no network requests to anyone — the fonts are served from this site, and there are no analytics, advertising or embedded third-party components.",
          "When you connect a payment provider and a backend, that stops being true, and this page has to be rewritten to describe what actually happens. Treat it as a starting draft, not a finished policy.",
        ],
      },
      {
        h: "Who is responsible",
        body: [
          "{{legalName}}, {{address}}, is the data controller. Data protection questions go to {{contactEmail}}.",
        ],
      },
      {
        h: "What we ask you for",
        body: [
          "At checkout: your email address. It is used to send the download and the receipt, and nothing else. We do not ask for your address, your course or your institution, because we do not need them to give you a file.",
          "If you open a seller account: your email address, and the name your sign-in provider gives us if you use one. Sellers need an account because we have to know who to pay. Buying needs no account.",
          "We never ask for a password on this site. Sign-in is a one-time link sent to your email, or a provider you already trust — so there is no password here to leak.",
          "If you list notes: the listing content you write. That is published, so treat it as public.",
          "If you review a pack you bought: your rating and review text, published against the listing.",
        ],
      },
      {
        h: "What is kept in your browser",
        body: [
          "Under the key mflcentre.v1 in local storage, this site keeps your cart, your orders, any listings you published, any reviews you left, and your signed-in account if you have one. It stays on your device until you clear it, is never sent anywhere, and is not readable by us.",
          "The cookies page lists it in full, and the clear-data button there removes it.",
        ],
      },
      {
        h: "Why we are allowed to hold it",
        body: [
          "Your email is processed to perform the contract you entered into when you bought a pack. Published listings and reviews are processed on the same basis for sellers, and on legitimate interests — running a marketplace people can trust — for their display.",
        ],
      },
      {
        h: "How long we keep it",
        body: [
          "Order records, including the email address attached to them, are kept for six years, because tax law requires it. Seller accounts are kept while the account is open and for six years after it closes, for the same reason. Reviews stay published until you delete them or the listing goes. Local storage lasts until you clear it.",
        ],
      },
      {
        h: "Who else sees it",
        body: [
          "Once a payment provider is connected, it will see what it needs to take the payment, and it will be named here. If you sign in with Google, Google will know you signed in here — the same as anywhere else you use it. Nobody else. We do not sell data and we do not share it for advertising.",
        ],
      },
      {
        h: "Your rights",
        body: [
          "You can ask for a copy of what we hold, ask us to correct or delete it, ask us to restrict or stop processing it, and ask for it in a portable form. Write to {{contactEmail}} and we will answer within one month.",
          "If we get it wrong you can complain to the Information Commissioner's Office at ico.org.uk, or to the supervisory authority where you live.",
        ],
      },
    ],
  },

  refunds: {
    nav: "Refunds",
    title: "Refund and cancellation policy",
    lede: "Digital files, and the cancellation right you keep or waive when you download one.",
    blocks: [
      {
        h: "The 14-day right, and why checkout asks you to waive it",
        body: [
          "For digital content bought online you normally have 14 days to cancel under the Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013.",
          "That right ends once the download starts, but only if you agreed to it starting immediately and acknowledged that you were giving up the right. That is exactly what the checkbox at checkout does, and it is why the checkbox is not ticked for you.",
          "If you would rather keep the 14 days, do not tick it — but then we cannot release the file until the 14 days are up, so in practice a purchase here means waiving it.",
        ],
      },
      {
        h: "When you get your money back anyway",
        body: [
          "Waiving the cancellation right does not touch your rights under the Consumer Rights Act 2015. We refund in full if:",
          {
            list: [
              "The pack is not what the listing described — wrong module, wrong level, far fewer pages, missing what the contents list promised.",
              "The file is corrupt, unreadable, or will not download.",
              "You were charged twice, or charged for something you did not buy.",
            ],
          },
          "Tell us within 30 days of the purchase at {{contactEmail}}, with your order reference. We may ask what is wrong with it, and we may ask the seller. We aim to decide within five working days and to refund within 14 days of agreeing to.",
        ],
      },
      {
        h: "When we will not refund",
        body: [
          "We will not refund because you changed your mind after downloading, because the notes did not raise your grade, or because you bought the wrong pack and downloaded it anyway. Check the contents list and the preview before you buy — that is what they are for.",
        ],
      },
      {
        h: "Chargebacks",
        body: [
          "Talk to us before you raise a chargeback. It is faster, and a chargeback against a seller who did nothing wrong costs them the sale and a fee.",
        ],
      },
    ],
  },

  cookies: {
    nav: "Cookies",
    title: "Cookies and local storage",
    lede: "This site sets no cookies. Here is what it does use, and why there is no consent banner.",
    blocks: [
      {
        h: "No cookies, no trackers",
        body: [
          "This site sets no cookies of any kind. It loads no analytics, no advertising tags, no social buttons, no embedded video, no chat widget and no third-party fonts. Open the network tab and you will see requests to this site and nowhere else.",
        ],
      },
      {
        h: "What it does store",
        body: [
          "One local storage entry, mflcentre.v1, holding:",
          {
            list: [
              "Your cart — so it survives a reload.",
              "Your orders — so your library keeps working and you can download again.",
              "Listings you published — so they are still there when you come back.",
              "Reviews you left — so the site knows you already reviewed a pack.",
              "Your signed-in account, so you stay signed in between visits.",
            ],
          },
          "It never leaves your device, has no expiry, and identifies nothing about you. There is no advertising or analytics identifier here.",
        ],
      },
      {
        h: "Why there is no consent banner",
        body: [
          "Under the Privacy and Electronic Communications Regulations, storage that is strictly necessary to provide the service the user asked for does not need consent. A shopping cart is the textbook example. Everything above is in that category, so a banner would be theatre.",
          "This changes the moment you add analytics, an advertising pixel, an embedded player or a chat widget. Any of those needs a real consent mechanism, with rejection as easy as acceptance, before the tag loads — not a banner that sets the cookie anyway.",
        ],
      },
      {
        h: "Clearing it",
        body: [
          "The button below deletes everything this site has stored on your device, including your order history and any listings you published. It cannot be undone.",
        ],
        action: "clear-data",
      },
    ],
  },

  accessibility: {
    nav: "Accessibility",
    title: "Accessibility statement",
    lede: "What has been done, what has been measured, and what has not been tested.",
    blocks: [
      {
        h: "What we aim for",
        body: [
          "WCAG 2.2 level AA. We are not there by proof — no formal audit has been carried out — but the site is built to it and the parts that can be measured are measured.",
        ],
      },
      {
        h: "What has been done",
        body: [
          {
            list: [
              "The site has a light theme and a dark one, and a control in the header to pick either or to follow your system. Every text and border colour pair in both themes — on the interface and on the white paper — is checked against the WCAG contrast formula by a script in the repository. The build fails if a pair drops below its threshold.",
              "Everything works from the keyboard: the shop, the filters, the cart, checkout, the listing form. Focus is always visible.",
              "The cart and checkout dialogs trap focus while open, close on Escape, and return focus to the control that opened them.",
              "Form fields have real labels, errors are announced and tied to the field they belong to, and no error is signalled by colour alone.",
              "The page uses landmarks and one h1 per view, so screen-reader navigation works.",
              "There are no images: covers and previews are drawn in CSS and hidden from assistive technology, with the same information available as text.",
              "Motion is short and always tied to something you did. Every animation and transition is switched off when your system asks for reduced motion, and nothing on the page starts out invisible, so the first painted frame is already the whole page.",
              "The page works at 200% zoom and down to 320px wide without sideways scrolling, in either theme.",
            ],
          },
        ],
      },
      {
        h: "What has not been tested",
        body: [
          "No testing with real screen-reader users. No testing with voice control or switch access. No independent audit. If you hit something that does not work, that list is where the problem probably is.",
        ],
      },
      {
        h: "Tell us",
        body: [
          "Email {{contactEmail}} with what you were trying to do and what happened. We will reply within five working days, and we will tell you when it is fixed.",
        ],
      },
    ],
  },

  integrity: {
    nav: "Copyright & integrity",
    title: "Copyright and academic integrity",
    lede: "What may be sold here, what may not, and how to get something taken down.",
    blocks: [
      {
        h: "Only your own work",
        body: [
          "Sellers may list only notes they wrote themselves. Not allowed, in any form:",
          {
            list: [
              "Lecture slides, handouts or recordings — those belong to the lecturer or the institution.",
              "Scanned or retyped textbook pages, problem sets or solution manuals.",
              "Past papers, mark schemes or question banks still in copyright.",
              "Another student's notes, with or without their say-so.",
              "Anything under an embargo or a non-disclosure agreement with an institution.",
            ],
          },
          "Notes written in your own words from a lecture you attended are yours. A photograph of the slide is not.",
        ],
      },
      {
        h: "Reporting an infringement",
        body: [
          "Email {{contactEmail}} with the listing link, what it copies, and enough for us to see that you hold the rights or act for whoever does. We take the listing down while we look, and we tell the seller who complained and why.",
          "Sellers can respond. If we have it wrong, the listing goes back up.",
        ],
      },
      {
        h: "Notes are a study aid",
        body: [
          "Everything here is material to study from. Nothing here is written to be handed in.",
          "We do not sell essays, assignments, dissertations or coursework written to order, and we do not connect buyers with people who write them. In England, providing or advertising that service is a criminal offence under the Skills and Post-16 Education Act 2022. Other countries have their own equivalents, and every university treats submitting bought work as misconduct.",
          "Submitting someone else's notes as your own work risks your degree. Use them the way you would use a library book.",
        ],
      },
      {
        h: "Reviews",
        body: [
          "Only people who bought a pack through this site can review it, and every review shown says so. We do not write reviews, we do not pay for them, and we do not delete a review for being negative — only for abuse, personal data or spam.",
          "Incentivised and fabricated reviews are banned outright by the Digital Markets, Competition and Consumers Act 2024. Nobody selling here gets to post one.",
        ],
      },
    ],
  },
};

const POLICY_ORDER = ["terms", "privacy", "refunds", "cookies", "accessibility", "integrity"];
