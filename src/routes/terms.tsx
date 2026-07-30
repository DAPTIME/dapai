import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — DAP AI" },
      {
        name: "description",
        content:
          "DAP AI Terms of Service — read our full legal agreement, user responsibilities, data practices, and policies.",
      },
      { property: "og:title", content: "Terms of Service — DAP AI" },
      {
        property: "og:description",
        content: "Full legal terms for using DAP AI.",
      },
      { property: "og:url", content: "https://dapai.lovable.app/terms" },
    ],
    links: [{ rel: "canonical", href: "https://dapai.lovable.app/terms" }],
  }),
  component: Terms,
});

function Terms() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12 text-foreground">
      <h1 className="text-3xl font-semibold tracking-tight">Terms of Service</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: June 3, 2026</p>



      <section className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
        <div>
          <h2 className="text-lg font-semibold text-foreground">1. Introduction & Agreement</h2>
          <p className="mt-2">
            Welcome to DAP AI (“DAP AI”, “we”, “us”, or “our”). These Terms of Service (“Terms”, “Agreement”) constitute a legally binding contract between you (“User”, “you”, or “your”) and DAP AI LABS governing your access to and use of the DAP AI website, applications, APIs, and all related services (collectively, the “Services”).
          </p>
          <p className="mt-2">
            By creating an account, accessing, or using the Services in any manner, you acknowledge that you have read, understood, and agree to be bound by these Terms and our Privacy Policy. If you do not agree to these Terms, you must not access or use the Services.
          </p>
          <p className="mt-2">
            We reserve the right to modify, update, or replace these Terms at any time. Material changes will be communicated via email or a prominent notice within the Services. Your continued use after changes constitutes acceptance.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">2. Eligibility & Account Registration</h2>
          <p className="mt-2">
            You must be at least 13 years of age to use the Services. If you are under the age of majority in your jurisdiction, you represent that your parent or legal guardian has reviewed and consented to these Terms on your behalf.
          </p>
          <p className="mt-2">
            To access certain features, you must register for an account. You agree to provide accurate, current, and complete information during registration and to update such information as necessary. You are solely responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account.
          </p>
          <p className="mt-2">
            You may not share your account credentials with any third party, nor may you use another User’s account without permission. You must notify us immediately of any unauthorized use of your account.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">3. Description of Services</h2>
          <p className="mt-2">
            DAP AI provides an AI-powered conversational platform that allows Users to interact with large language models, create custom AI personas (“DAPs”), and manage chat histories. The Services include both free and paid subscription tiers.
          </p>
          <p className="mt-2">
            DAP AI is delivered as a mixture-of-experts model: a pool of specialist models of which only those suited to a given request are used to produce a reply. The pool comprises 15 to 23 experts depending on the subscription plan, each of approximately 7-9 billion parameters. The number of experts available to a plan, the models in the pool, and the routing between them may change at any time as the Services are developed, and no particular model, expert count, or parameter size is guaranteed as part of any plan.
          </p>
          <p className="mt-2">
            Inference runs on hardware operated by DAP AI rather than a third-party model provider. Your conversations are not forwarded to OpenAI, Anthropic, or Google for the purpose of generating replies.
          </p>
          <p className="mt-2">
            We do not guarantee that the Services will be uninterrupted, timely, secure, or error-free. AI-generated responses are provided “as is” and may contain inaccuracies, biases, or outdated information. You acknowledge that AI outputs are not professional advice and should not be relied upon for legal, medical, financial, or other critical decisions.
          </p>
          <p className="mt-2">
            We may change, suspend, or discontinue any aspect of the Services at any time, including the availability of any feature, database, or content. We may also impose limits on certain features or restrict your access without prior notice.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">4. Subscription Plans & Payments</h2>
          <p className="mt-2">
            DAP AI offers Free and Pro subscription plans. Free plans include limited usage quotas. Pro plans are billed on a recurring basis as disclosed at the time of purchase.
          </p>
          <p className="mt-2">
            By subscribing to a paid plan, you authorize us to charge your chosen payment method for all applicable fees, including taxes. All payments are non-refundable except where required by law.
          </p>
          <p className="mt-2">
            You may cancel your subscription at any time through your account settings. Cancellation takes effect at the end of the current billing cycle. We reserve the right to change pricing upon reasonable notice.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">5. User Conduct & Acceptable Use</h2>
          <p className="mt-2">
            You agree to use the Services only for lawful purposes and in accordance with these Terms. You may not:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Use the Services in any way that violates any applicable local, state, national, or international law or regulation.</li>
            <li>Engage in any conduct that is fraudulent, deceptive, or manipulative.</li>
            <li>Upload, transmit, or distribute any content that is unlawful, harmful, threatening, abusive, harassing, defamatory, vulgar, obscene, invasive of another’s privacy, or otherwise objectionable.</li>
            <li>Impersonate any person or entity, or falsely state or otherwise misrepresent your affiliation with a person or entity.</li>
            <li>Interfere with or disrupt the Services or servers or networks connected to the Services.</li>
            <li>Attempt to gain unauthorized access to any portion of the Services, other accounts, or computer systems or networks connected to the Services.</li>
            <li>Use any robot, spider, scraper, or other automated means to access the Services for any purpose without our express written permission.</li>
            <li>Reverse engineer, decompile, or disassemble any aspect of the Services.</li>
            <li>Use the Services to develop, train, or improve any competing artificial intelligence or machine learning model without our written consent.</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">6. Intellectual Property Rights</h2>
          <p className="mt-2">
            All content, features, and functionality of the Services — including but not limited to text, graphics, logos, icons, images, audio clips, digital downloads, data compilations, and software — are the exclusive property of DAP AI LABS or its licensors and are protected by international copyright, trademark, patent, trade secret, and other intellectual property laws.
          </p>
          <p className="mt-2">
            Subject to your compliance with these Terms, we grant you a limited, non-exclusive, non-transferable, non-sublicensable, revocable license to access and use the Services for your personal or internal business purposes.
          </p>
          <p className="mt-2">
            You retain ownership of any content you submit, post, or display through the Services (“User Content”). By submitting User Content, you grant us a worldwide, royalty-free, sublicensable, and transferable license to use, reproduce, modify, adapt, publish, and display such content solely for the purpose of operating and improving the Services.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">7. AI-Generated Content & Disclaimers</h2>
          <p className="mt-2">
            The Services utilize third-party artificial intelligence models to generate responses. DAP AI does not control the specific outputs generated by these models and makes no representations regarding the accuracy, completeness, or reliability of any AI-generated content.
          </p>
          <p className="mt-2">
            You understand and agree that:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>AI-generated content may be incorrect, incomplete, misleading, or offensive.</li>
            <li>DAP AI is not responsible for any decisions or actions you take based on AI-generated content.</li>
            <li>You should independently verify any critical information before relying on it.</li>
            <li>We do not endorse any opinions, advice, or recommendations expressed by the AI.</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">8. Termination & Account Suspension</h2>
          <p className="mt-2">
            We may suspend or terminate your account and access to the Services at any time, with or without cause, and with or without notice. Grounds for termination include but are not limited to: violation of these Terms, fraudulent payment activity, prolonged inactivity, or requests by law enforcement or government agencies.
          </p>
          <p className="mt-2">
            Upon termination, all licenses granted to you under these Terms will immediately cease. You remain liable for all amounts due up to and including the date of termination. Provisions that by their nature should survive termination shall survive, including but not limited to intellectual property rights, disclaimers, indemnification, and limitations of liability.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">9. Disclaimers & Limitation of Liability</h2>
          <p className="mt-2">
            THE SERVICES ARE PROVIDED ON AN “AS IS” AND “AS AVAILABLE” BASIS WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, OR COURSE OF PERFORMANCE.
          </p>
          <p className="mt-2">
            TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL DAP AI LABS, ITS DIRECTORS, EMPLOYEES, PARTNERS, AGENTS, SUPPLIERS, OR AFFILIATES BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING WITHOUT LIMITATION, LOSS OF PROFITS, DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES, RESULTING FROM YOUR ACCESS TO OR USE OF OR INABILITY TO ACCESS OR USE THE SERVICES.
          </p>
          <p className="mt-2">
            IN NO EVENT SHALL OUR TOTAL LIABILITY TO YOU FOR ALL CLAIMS EXCEED THE AMOUNT YOU PAID TO US, IF ANY, DURING THE TWELVE (12) MONTH PERIOD IMMEDIATELY PRECEDING THE EVENT GIVING RISE TO LIABILITY.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">10. Indemnification</h2>
          <p className="mt-2">
            You agree to defend, indemnify, and hold harmless DAP AI LABS and its affiliates, licensors, and service providers, and its and their respective officers, directors, employees, contractors, agents, licensors, suppliers, successors, and assigns from and against any claims, liabilities, damages, judgments, awards, losses, costs, expenses, or fees (including reasonable attorneys’ fees) arising out of or relating to your violation of these Terms or your use of the Services.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">11. Governing Law & Dispute Resolution</h2>
          <p className="mt-2">
            These Terms shall be governed by and construed in accordance with the laws of the jurisdiction in which DAP AI LABS is established, without regard to its conflict of law provisions.
          </p>
          <p className="mt-2">
            Any dispute, controversy, or claim arising out of or relating to these Terms or the Services shall first be attempted to be resolved through good-faith negotiations. If the dispute cannot be resolved within thirty (30) days, it shall be finally settled by binding arbitration in accordance with the rules of a recognized arbitration body.
          </p>
          <p className="mt-2">
            Notwithstanding the foregoing, either party may seek injunctive or other equitable relief in a court of competent jurisdiction to prevent irreparable harm pending the completion of arbitration.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">12. Severability & Waiver</h2>
          <p className="mt-2">
            If any provision of these Terms is held to be invalid, illegal, or unenforceable for any reason, such provision shall be modified to the minimum extent necessary to make it valid and enforceable, or if not possible, eliminated; the remaining provisions shall continue in full force and effect.
          </p>
          <p className="mt-2">
            No waiver by us of any term or condition set forth in these Terms shall be deemed a further or continuing waiver of such term or condition or a waiver of any other term or condition.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">13. Third-Party Services & Links</h2>
          <p className="mt-2">
            The Services may contain links to third-party websites or services that are not owned or controlled by DAP AI. We have no control over, and assume no responsibility for, the content, privacy policies, or practices of any third-party websites or services. You acknowledge and agree that DAP AI shall not be responsible or liable, directly or indirectly, for any damage or loss caused or alleged to be caused by or in connection with the use of or reliance on any such content, goods, or services available on or through any such websites or services.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">14. Force Majeure</h2>
          <p className="mt-2">
            DAP AI shall not be liable for any failure or delay in performing its obligations under these Terms where such failure or delay results from causes beyond our reasonable control, including but not limited to natural disasters, war, terrorism, riots, embargoes, acts of civil or military authorities, fire, floods, accidents, strikes, shortages of transportation, facilities, fuel, energy, labor, or materials, or failure of telecommunications or internet service providers.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">15. Assignment</h2>
          <p className="mt-2">
            You may not assign or transfer these Terms, by operation of law or otherwise, without our prior written consent. Any attempt by you to assign or transfer these Terms without such consent shall be null and void. We may freely assign or transfer these Terms without restriction. Subject to the foregoing, these Terms shall bind and inure to the benefit of the parties and their respective successors and permitted assigns.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">16. Entire Agreement</h2>
          <p className="mt-2">
            These Terms, together with our Privacy Policy and any other legal notices published by us on the Services, constitute the entire agreement between you and DAP AI concerning the Services and supersede all prior or contemporaneous understandings, agreements, representations, and warranties, whether written or oral.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">17. Contact Information</h2>
          <p className="mt-2">
            If you have any questions about these Terms, please contact us at pancholiadevansh@gmail.com. We will make every reasonable effort to respond to your inquiry within five (5) business days.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">18. Data Privacy & Sale of Personal Information</h2>
          <p className="mt-2">
            At DAP AI, we take your privacy seriously. We collect and process personal data only as necessary to provide, maintain, and improve the Services. We employ industry-standard security measures to protect your information from unauthorized access, disclosure, alteration, or destruction.
          </p>
          <p className="mt-2">
            We may share your personal data with trusted third-party service providers who assist us in operating the Services (such as hosting providers, payment processors, and analytics services). These providers are contractually obligated to use your data solely for the purpose of providing services to us and are prohibited from using it for their own purposes.
          </p>
          <p className="mt-2">
            We may also disclose your personal data if required to do so by law or in response to valid requests by public authorities (e.g., a court or government agency).
          </p>
          <p className="mt-2 font-semibold text-foreground">
            IMPORTANT: DAP AI does not and will never sell your personal data to third parties for monetary or other valuable consideration. Your personal information is used exclusively to operate and improve the Services and will not be sold, rented, or traded to advertisers, data brokers, or any other external parties under any circumstances.
          </p>
        </div>
      </section>
    </div>
  );
}
