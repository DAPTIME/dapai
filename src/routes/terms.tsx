import { createFileRoute } from "@tanstack/react-router";
import { SUPPORT_EMAIL, LINKTREE_URL } from "@/lib/plans";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — DAP Games" },
      {
        name: "description",
        content:
          "DAP Games Terms of Service — accounts, fair play, user-generated tracks, advertising and Pro, and the rest of our legal agreement.",
      },
      { property: "og:title", content: "Terms of Service — DAP Games" },
      {
        property: "og:description",
        content: "Full legal terms for using DAP Games.",
      },
      { property: "og:url", content: "https://dapgames.lovable.app/terms" },
    ],
    links: [{ rel: "canonical", href: "https://dapgames.lovable.app/terms" }],
  }),
  component: Terms,
});

function Terms() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12 text-foreground">
      <h1 className="text-3xl font-semibold tracking-tight">Terms of Service</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: August 3, 2026</p>

      <div className="mt-6 rounded-lg border border-border bg-muted/40 p-4 text-sm leading-relaxed text-muted-foreground">
        <p className="font-semibold text-foreground">Please read this carefully.</p>
        <p className="mt-2">
          These Terms include an <strong>&ldquo;as is&rdquo; disclaimer of all warranties</strong>{" "}
          (Section 11) and a <strong>limitation of our liability</strong> (Section 11). They affect
          your legal rights. If you do not accept them, do not use the Services.
        </p>
      </div>

      <section className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
        <div>
          <h2 className="text-lg font-semibold text-foreground">1. Who We Are &amp; Acceptance</h2>
          <p className="mt-2">
            Welcome to DAP Games (&ldquo;DAP Games&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;, or
            &ldquo;our&rdquo;). These Terms of Service (&ldquo;Terms&rdquo;) are a legally binding
            agreement between you (&ldquo;User&rdquo;, &ldquo;you&rdquo;) and DAP Games governing your
            access to and use of the DAP Games website, its browser games, the DAP Track editor and
            leaderboards, and all related features (collectively, the &ldquo;Services&rdquo;).
          </p>
          <p className="mt-2">
            By creating an account, or by accessing or using the Services in any way — including as
            an unregistered or guest player — you agree to be bound by these Terms. If you do not
            agree, do not use the Services.
          </p>
          <p className="mt-2">
            We may update these Terms from time to time; see Section 10 for how changes take effect.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">2. Accounts &amp; Account Security</h2>
          <p className="mt-2">
            Some features — saving leaderboard times, publishing DAP Track levels, keeping settings
            across devices — require an account. You agree to provide accurate information when you
            register and to keep your credentials confidential. You are responsible for all activity
            that happens under your account, whether or not you authorised it.
          </p>
          <p className="mt-2">
            You may not share your account with anyone else, or use someone else&rsquo;s account
            without permission. Notify us immediately at{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary underline">
              {SUPPORT_EMAIL}
            </a>{" "}
            if you suspect unauthorised use of your account.
          </p>
          <p className="mt-2">
            Password recovery may rely on a security question you choose. That mechanism is weaker
            than recovery by verified email — anyone who knows or guesses your answer may be able to
            reset your password. Choose a question and answer that others cannot easily guess, and
            keep the answer secret. If you lose access to both your password and your recovery
            answer, your account may be unrecoverable.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">3. Age &amp; Minors</h2>
          <p className="mt-2">
            The Services are general-audience browser games and are not directed at collecting
            personal information from young children. If you are under the age required by the law
            of your country to consent to online services on your own, you should only use the
            Services with the involvement of a parent or guardian.
          </p>
          <p className="mt-2">
            If we become aware that an account belongs to a child in violation of applicable law, we
            may suspend or delete that account. Parents or guardians who believe a child has created
            an account can contact us at{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary underline">
              {SUPPORT_EMAIL}
            </a>{" "}
            and we will remove it.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">
            4. Acceptable Use &amp; Fair Play
          </h2>
          <p className="mt-2">
            The games, tracks, times, medals, ghosts, and leaderboards on DAP Games are offered for
            entertainment only. They carry no monetary value, are not prizes, and confer no property
            right. No wagering, gambling, or paid competition is offered.
          </p>
          <p className="mt-2">You agree not to:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              Cheat, script, automate inputs, or otherwise manipulate a recorded time or leaderboard
              position, including by modifying the client, intercepting or forging requests, or
              exploiting a defect.
            </li>
            <li>Share an account, or use another player&rsquo;s account, to inflate results.</li>
            <li>Interfere with or disrupt the Services, or attempt unauthorised access to any account or system.</li>
            <li>Use a robot, scraper, or other automated tool against the Services without our permission.</li>
            <li>Upload or publish anything unlawful, harassing, hateful, sexually explicit, or otherwise objectionable.</li>
          </ul>
          <p className="mt-2">
            We may remove any time, reset any leaderboard, and suspend or terminate any account we
            reasonably believe has broken these rules, at our discretion and without refund or
            liability. Times, personal bests, ghosts, and progress may be stored only in your browser
            in places, may be lost if you clear browser data or switch devices, and may be reset or
            recalculated at any time. No leaderboard is guaranteed to be accurate, current, or
            preserved.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">
            5. User-Generated Content (DAP Track)
          </h2>
          <p className="mt-2">
            DAP Track&rsquo;s editor lets you build and publish your own tracks (&ldquo;User
            Content&rdquo;). You retain ownership of tracks you create. By publishing a track, you
            grant us and every player a licence to host it, display it, and let other players load
            and race it through the Services for as long as it stays published.
          </p>
          <p className="mt-2">
            You are solely responsible for what you publish. You must not publish a track that is
            unlawful, infringes someone else&rsquo;s rights, contains offensive names or content, or
            is designed to break or exploit the game.
          </p>
          <p className="mt-2">
            We have no obligation to review every published track before it appears, but we may
            review, unpublish, edit, or delete any track, and suspend or terminate the account
            responsible, at our discretion and without notice. If you believe a published track is
            inappropriate or breaks these Terms, report it using the in-game report option or email{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary underline">
              {SUPPORT_EMAIL}
            </a>
            . We will look into reports we receive but cannot guarantee a particular outcome or
            timescale.
          </p>
          <p className="mt-2">
            When you record a time, your display name (or, if you have not set one, the part of your
            email before the &ldquo;@&rdquo;) may appear on a public leaderboard visible to other
            players, including players who are not signed in. Set a display name in your account
            settings if you do not want any part of your email shown.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">
            6. Advertising, Cookies &amp; the Pro Tier
          </h2>
          <p className="mt-2">
            DAP Games is supported by advertising. We display banner ads through Google AdSense, and
            we may show a short video or interstitial ad (typically 10&ndash;15 seconds) before a
            game loads. Google and its partners may use cookies and similar technologies to serve ads
            based on your visits to this and other sites (&ldquo;personalised advertising&rdquo;), or
            to serve ads without using that history (&ldquo;non-personalised advertising&rdquo;),
            depending on your region, consent choices, and applicable law. See Google&rsquo;s own
            policies for how it uses this data.
          </p>
          <p className="mt-2">
            You may see fewer or no ads if you use an ad blocker, but some parts of the Services may
            not function correctly, and we may ask ad-blocker users to disable it or upgrade to Pro.
            Ads help keep DAP Games free to play; interfering with their delivery through automated
            or fraudulent means (including click fraud) is prohibited and may result in account
            suspension.
          </p>
          <p className="mt-2">
            Pro removes ads across the site, including the pre-game video ad. There is no in-app
            payment flow yet — to request Pro (or another paid plan), email us at{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary underline">
              {SUPPORT_EMAIL}
            </a>{" "}
            or reach us via{" "}
            <a href={LINKTREE_URL} className="text-primary underline" target="_blank" rel="noreferrer">
              our Linktree
            </a>
            . We will confirm price and payment method with you directly before anything is charged.
            Plan benefits, pricing, and availability may change at any time.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">
            7. Third-Party Embedded Games
          </h2>
          <p className="mt-2">
            Some games on DAP Games (for example, our PolyTrack integration) are third-party games
            embedded through an iframe or similar technology rather than built by us. Those games run
            under their own code and, in some cases, their own separate terms and privacy practices.
          </p>
          <p className="mt-2">
            We do not control, and are not responsible for, the content, availability, security, or
            behaviour of embedded third-party games. If a third-party game is withdrawn by its owner,
            changes without notice, or becomes unavailable, we may remove or replace it at any time.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">
            8. Availability, Maintenance &amp; Feature Flags
          </h2>
          <p className="mt-2">
            We do not guarantee that the Services, or any individual game, will be available,
            uninterrupted, or error-free. We may take a game or feature offline for maintenance,
            testing, or any other reason, with or without notice, using feature flags or otherwise.
            A game marked &ldquo;under maintenance&rdquo; may be unavailable for an unspecified time.
          </p>
          <p className="mt-2">
            We may add, change, or remove games, features, plans, or leaderboards at any time, and we
            accept no liability for the unavailability of any game or feature.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">
            9. No Warranty &amp; Limitation of Liability
          </h2>
          <p className="mt-2 font-medium text-foreground">
            The Services are provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without
            warranties of any kind, express or implied, including merchantability, fitness for a
            particular purpose, and non-infringement.
          </p>
          <p className="mt-2">
            To the maximum extent permitted by law, DAP Games and its operators will not be liable
            for any indirect, incidental, special, consequential, or punitive damages, or for any
            loss of data, saved times, or published tracks, arising from your use of, or inability to
            use, the Services, even if we have been advised of the possibility of such damages.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">
            10. Suspension, Termination &amp; Changes to These Terms
          </h2>
          <p className="mt-2">
            We may suspend or terminate your account, or your access to any game or feature, at our
            discretion, including for breach of Section 4 or Section 5, without notice or liability.
            You may stop using the Services, or ask us to delete your account, at any time by emailing{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary underline">
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
          <p className="mt-2">
            We may modify these Terms at any time. Material changes will be reflected by an updated
            &ldquo;Last updated&rdquo; date above, and, where practical, a notice within the Services.
            Continuing to use the Services after a change takes effect means you accept the revised
            Terms.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">11. Contact</h2>
          <p className="mt-2">
            Questions about these Terms, account or content reports, or requests to upgrade to Pro or
            delete your account, can be sent to{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary underline">
              {SUPPORT_EMAIL}
            </a>{" "}
            or via{" "}
            <a href={LINKTREE_URL} className="text-primary underline" target="_blank" rel="noreferrer">
              our Linktree
            </a>
            .
          </p>
        </div>
      </section>
    </div>
  );
}
