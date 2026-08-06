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
      <p className="mt-2 text-sm text-muted-foreground">Last updated: August 3, 2026</p>

      <div className="mt-6 rounded-lg border border-border bg-muted/40 p-4 text-sm leading-relaxed text-muted-foreground">
        <p className="font-semibold text-foreground">Please read this carefully.</p>
        <p className="mt-2">
          These Terms include an <strong>“as is” disclaimer of all warranties</strong> (Section 12), a{" "}
          <strong>limitation of our liability</strong> (Section 13), an{" "}
          <strong>indemnity you owe to us</strong> (Section 14), a{" "}
          <strong>one-year deadline to bring any claim</strong> (Section 15), and an{" "}
          <strong>agreement to resolve disputes individually rather than as a class</strong> (Section 16).
          They affect your legal rights. If you do not accept them, do not use the Services.
        </p>
      </div>

      <section className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
        <div>
          <h2 className="text-lg font-semibold text-foreground">1. Introduction &amp; Agreement</h2>
          <p className="mt-2">
            Welcome to DAP AI (“DAP AI”, “we”, “us”, or “our”). These Terms of Service (“Terms”, “Agreement”) constitute a legally binding contract between you (“User”, “you”, or “your”) and DAP AI LABS governing your access to and use of the DAP AI website, applications, APIs, games, and all related services (collectively, the “Services”).
          </p>
          <p className="mt-2">
            By creating an account, accessing, or using the Services in any manner — including as an unregistered or guest user — you acknowledge that you have read, understood, and agree to be bound by these Terms and our Privacy Policy. If you do not agree to these Terms, you must not access or use the Services. Your only remedy for dissatisfaction with the Services or these Terms is to stop using the Services.
          </p>
          <p className="mt-2">
            You represent that you have the legal capacity to enter into this Agreement, and that if you are accepting these Terms on behalf of a company or other organisation, you have authority to bind that entity, in which case “you” means that entity.
          </p>
          <p className="mt-2">
            We reserve the right to modify, update, or replace these Terms at any time in our sole discretion. Material changes will be communicated via email or a prominent notice within the Services. Your continued use after changes take effect constitutes acceptance. It is your responsibility to review these Terms periodically.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">2. Eligibility &amp; Account Registration</h2>
          <p className="mt-2">
            You must be at least <strong>18 years of age</strong> to use the Services. The Services are not directed to, offered to, or intended for use by anyone under 18, and by accessing the Services you represent and warrant that you are 18 or older.
          </p>
          <p className="mt-2">
            If we become aware that a User is under 18, we may suspend or delete the account and any associated data without notice and without liability. If you are a parent or guardian and believe a minor has used the Services, contact us under Section 23 and we will remove the account.
          </p>
          <p className="mt-2">
            You represent and warrant that you are not barred from using the Services under the laws of your jurisdiction, that you are not located in, or a national or resident of, any country subject to comprehensive sanctions, and that you are not on any restricted-party or denied-persons list.
          </p>
          <p className="mt-2">
            To access certain features, you must register for an account. You agree to provide accurate, current, and complete information during registration and to update such information as necessary. You are solely responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account, whether or not authorised by you.
          </p>
          <p className="mt-2">
            You may not share your account credentials with any third party, nor may you use another User’s account without permission. You must notify us immediately of any unauthorised use of your account. We are not liable for any loss or damage arising from your failure to safeguard your credentials.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">3. Description of Services</h2>
          <p className="mt-2">
            DAP AI provides an AI-powered conversational platform that allows Users to interact with large language models, create custom AI personas (“DAPs”), manage chat histories, and use additional features such as games and community content. The Services include both free and paid tiers.
          </p>
          <p className="mt-2">
            DAP AI is delivered as a mixture-of-experts model: a pool of specialist models of which only those suited to a given request are used to produce a reply. The pool comprises 15 to 23 experts depending on the plan, each of approximately 7-9 billion parameters. The number of experts available to a plan, the models in the pool, and the routing between them may change at any time as the Services are developed, and no particular model, expert count, parameter size, response quality, or speed is guaranteed as part of any plan.
          </p>
          <p className="mt-2">
            Inference runs on hardware operated by DAP AI rather than a third-party model provider. Your conversations are not forwarded to OpenAI, Anthropic, or Google for the purpose of generating replies.
          </p>
          <p className="mt-2 font-medium text-foreground">
            The Services are experimental. You acknowledge that DAP AI is developed and operated by a small independent team, that features may be incomplete, unstable, or withdrawn, and that the Services should be treated as a beta or evaluation product rather than a production-grade system.
          </p>
          <p className="mt-2">
            We do not guarantee that the Services will be uninterrupted, timely, secure, accurate, or error-free. We may change, suspend, limit, or discontinue any aspect of the Services at any time, including the availability of any feature, model, plan, database, or content, with or without notice and without liability to you.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">4. User Conduct &amp; Acceptable Use</h2>
          <p className="mt-2">
            You agree to use the Services only for lawful purposes and in accordance with these Terms. You may not:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Use the Services in any way that violates any applicable local, national, or international law or regulation.</li>
            <li>Engage in any conduct that is fraudulent, deceptive, or manipulative.</li>
            <li>Upload, transmit, or distribute any content that is unlawful, harmful, threatening, abusive, harassing, defamatory, vulgar, obscene, invasive of another’s privacy, or otherwise objectionable.</li>
            <li>Generate, solicit, or distribute content that sexualises minors, incites violence or terrorism, or facilitates the creation of weapons or malicious software.</li>
            <li>Impersonate any person or entity, or misrepresent your affiliation with a person or entity.</li>
            <li>Interfere with or disrupt the Services or the servers or networks connected to them.</li>
            <li>Attempt to gain unauthorised access to any portion of the Services, other accounts, or connected systems or networks.</li>
            <li>Use any robot, spider, scraper, or other automated means to access the Services without our express written permission.</li>
            <li>Reverse engineer, decompile, or disassemble any aspect of the Services, or attempt to extract model weights, prompts, or training data.</li>
            <li>Use the Services to develop, train, or improve any competing artificial intelligence or machine-learning model without our written consent.</li>
            <li>Resell, sublicense, or commercially exploit the Services or their output without our written consent.</li>
          </ul>
          <p className="mt-2">
            We may investigate any suspected breach and may remove content, restrict features, or suspend or terminate accounts at our sole discretion. We may report unlawful activity to the relevant authorities.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">5. Prohibited &amp; High-Risk Uses</h2>
          <p className="mt-2 font-medium text-foreground">
            The Services are not designed, tested, certified, or intended for use in any situation where failure, inaccuracy, or unavailability could lead to death, personal injury, or severe physical, environmental, or financial harm.
          </p>
          <p className="mt-2">
            You must not use the Services, or any output of the Services, in or in connection with:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Medical diagnosis, treatment, prescription, triage, or any other clinical decision-making.</li>
            <li>Emergency services, crisis response, or any life-safety or life-support application.</li>
            <li>The operation of vehicles, aircraft, vessels, industrial machinery, or autonomous systems.</li>
            <li>Critical infrastructure, including power, water, transport, or telecommunications control systems.</li>
            <li>Legal, tax, accounting, immigration, or regulatory filings or advice given to third parties.</li>
            <li>Financial, investment, insurance, or credit decisions, or the automated execution of trades.</li>
            <li>Employment, housing, education, lending, or insurance eligibility decisions about any individual.</li>
            <li>Any application where an inaccurate output could result in harm to a person or their legal rights.</li>
          </ul>
          <p className="mt-2">
            If you use the Services for any prohibited or high-risk purpose, you do so entirely at your own risk, you accept sole responsibility for all resulting consequences, and you agree to indemnify us in full under Section 14.
          </p>
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
          <p className="mt-2">
            You represent and warrant that you own or have all necessary rights to your User Content, and that it does not infringe the rights of any third party. You are solely responsible for your User Content and for any claim arising from it.
          </p>
          <p className="mt-2">
            We make no representation that output generated by the Services is original, non-infringing, or capable of protection. Output may be similar or identical to output provided to other Users. You are responsible for confirming that your use of any output does not infringe the rights of others.
          </p>
          <p className="mt-4 font-medium text-foreground">A note on “Your AI. Your hardware.”</p>
          <p className="mt-2">
            That line is our motto, and we would rather be plain about what it does and does not mean. It is a promise about <em>where your work lives</em>: DAP AI runs on machines that DAP AI LABS owns and operates itself, not on rented capacity in someone else&rsquo;s datacentre. So when we say “your hardware”, we mean hardware kept for you rather than hardware given to you.
          </p>
          <p className="mt-2">
            To be clear about ownership: the model, the software and the physical machines are and remain the property of DAP AI LABS. Using the Services does not transfer any interest in them to you. What genuinely is yours is your data — your prompts, your files and your conversations stay your property, and we do not sell them (see Section 22).
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">7. AI-Generated Content</h2>
          <p className="mt-2 font-medium text-foreground">
            DAP AI can be wrong. Responses are generated by a model and we make no representations regarding the accuracy, completeness, currency, or reliability of any AI-generated content.
          </p>
          <p className="mt-2">You understand and agree that:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>AI-generated content may be incorrect, incomplete, misleading, biased, offensive, or entirely fabricated, including citations, statistics, quotations, and references that do not exist.</li>
            <li>The same question may produce different answers at different times, and no output is guaranteed to be reproducible.</li>
            <li>DAP AI is not responsible for any decision or action you take based on AI-generated content.</li>
            <li>You must independently verify any information before relying on it for any purpose.</li>
            <li>We do not endorse any opinion, advice, or recommendation expressed by the AI, and outputs do not represent the views of DAP AI LABS.</li>
            <li>Output may reflect biases present in training data despite our efforts to reduce them.</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">8. No Professional Advice</h2>
          <p className="mt-2">
            The Services do not provide medical, legal, financial, tax, accounting, psychological, veterinary, engineering, or any other form of professional or regulated advice, and no output constitutes such advice. No professional relationship of any kind — including doctor-patient, attorney-client, or fiduciary — is created by your use of the Services.
          </p>
          <p className="mt-2">
            Always seek the advice of a qualified professional with any question regarding a medical condition, a legal matter, a financial decision, or any other regulated subject. Never disregard professional advice, or delay seeking it, because of something you read in an output of the Services.
          </p>
          <p className="mt-2 font-medium text-foreground">
            If you believe you may be experiencing a medical or mental-health emergency, contact your local emergency services immediately. Do not use the Services for that purpose.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">9. Assumption of Risk &amp; Your Responsibility</h2>
          <p className="mt-2 font-medium text-foreground">
            You use the Services voluntarily and entirely at your own risk.
          </p>
          <p className="mt-2">
            You accept full and sole responsibility for: the prompts and content you submit; your evaluation of any output; every decision you make or action you take in reliance on the Services; the consequences of sharing, publishing, or acting upon any output; and your compliance with all laws applicable to your use of the Services and their output.
          </p>
          <p className="mt-2">
            You acknowledge that no verification, review, moderation, or human oversight is applied to individual outputs before you receive them, and that you are the only safeguard between an output and its consequences.
          </p>
          <p className="mt-2">
            To the maximum extent permitted by law, you release DAP AI LABS and the persons listed in Section 13 from all claims, demands, and damages of every kind arising out of or connected with your use of the Services or your reliance on any output.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">10. Availability, Data &amp; Loss</h2>
          <p className="mt-2">
            We do not guarantee any level of uptime, availability, performance, or response time, and we do not offer a service level agreement. The Services may be unavailable for maintenance, upgrades, hardware failure, network failure, or any other reason, at any time and without notice.
          </p>
          <p className="mt-2 font-medium text-foreground">
            We do not guarantee that your data will be retained, backed up, or recoverable. You are solely responsible for keeping your own copies of anything you value.
          </p>
          <p className="mt-2">
            Chat histories, custom personas, saved times, uploaded files, and any other stored content may be deleted, corrupted, truncated, or lost — including as a result of quota limits, plan changes, migration, hardware failure, or error — and we accept no liability for any such loss. Where a plan imposes a memory or retention limit, older content may be discarded automatically.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">11. Termination &amp; Account Suspension</h2>
          <p className="mt-2">
            We may suspend or terminate your account and access to the Services at any time, with or without cause, and with or without notice, in our sole discretion. Grounds include but are not limited to: violation of these Terms, fraudulent or disputed payment activity, abuse of the Services or of other Users, prolonged inactivity, or requests by law enforcement or government agencies.
          </p>
          <p className="mt-2">
            You may stop using the Services at any time and may request deletion of your account. Termination does not entitle you to any refund except where required by law.
          </p>
          <p className="mt-2">
            Upon termination, all licenses granted to you under these Terms immediately cease and we may delete your data without further notice. You remain liable for all amounts due up to and including the date of termination. Provisions that by their nature should survive termination shall survive, including Sections 5 through 16 and Section 24.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">12. Disclaimer of Warranties</h2>
          <p className="mt-2">
            THE SERVICES, INCLUDING ALL CONTENT AND OUTPUT, ARE PROVIDED ON AN “AS IS” AND “AS AVAILABLE” BASIS WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, EITHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, SATISFACTORY QUALITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, ACCURACY, QUIET ENJOYMENT, NON-INFRINGEMENT, OR COURSE OF PERFORMANCE.
          </p>
          <p className="mt-2">
            WE DO NOT WARRANT THAT THE SERVICES WILL MEET YOUR REQUIREMENTS, THAT OUTPUT WILL BE ACCURATE OR RELIABLE, THAT ACCESS WILL BE UNINTERRUPTED OR SECURE, THAT DEFECTS WILL BE CORRECTED, OR THAT THE SERVICES ARE FREE OF VIRUSES OR OTHER HARMFUL COMPONENTS. NO ADVICE OR INFORMATION, WHETHER ORAL OR WRITTEN, OBTAINED FROM US OR THROUGH THE SERVICES CREATES ANY WARRANTY NOT EXPRESSLY STATED HERE.
          </p>
          <p className="mt-2">
            Some jurisdictions do not allow the exclusion of certain warranties. Where that is the case, the exclusions above apply to the fullest extent permitted by the applicable law, and any warranty that cannot lawfully be excluded is limited in duration and scope to the minimum permitted.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">13. Limitation of Liability</h2>
          <p className="mt-2">
            TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL DAP AI LABS, ITS FOUNDER, OWNERS, DIRECTORS, OFFICERS, EMPLOYEES, CONTRACTORS, PARTNERS, AGENTS, SUPPLIERS, OR AFFILIATES (TOGETHER, THE “PROTECTED PARTIES”) BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, REVENUE, DATA, USE, BUSINESS, OPPORTUNITY, REPUTATION, OR GOODWILL, ARISING OUT OF OR RELATING TO THESE TERMS OR THE SERVICES, WHETHER IN CONTRACT, TORT (INCLUDING NEGLIGENCE), STRICT LIABILITY, OR ANY OTHER THEORY, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
          </p>
          <p className="mt-2">
            THIS EXCLUSION APPLIES REGARDLESS OF THE CAUSE, INCLUDING WITHOUT LIMITATION: INACCURATE, HARMFUL, OR FABRICATED OUTPUT; ANY DECISION OR ACTION TAKEN IN RELIANCE ON THE SERVICES; SERVICE INTERRUPTION OR DISCONTINUATION; LOSS OR CORRUPTION OF DATA; UNAUTHORISED ACCESS TO YOUR ACCOUNT OR DATA; OR THE CONDUCT OF ANY THIRD PARTY OR OTHER USER.
          </p>
          <p className="mt-2">
            TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, THE TOTAL AGGREGATE LIABILITY OF THE PROTECTED PARTIES FOR ALL CLAIMS ARISING OUT OF OR RELATING TO THESE TERMS OR THE SERVICES SHALL NOT EXCEED THE GREATER OF (A) THE TOTAL AMOUNT YOU ACTUALLY PAID TO US IN THE TWELVE (12) MONTHS IMMEDIATELY PRECEDING THE EVENT GIVING RISE TO THE CLAIM, OR (B) ONE HUNDRED UAE DIRHAMS (AED 100).
          </p>
          <p className="mt-2">
            You acknowledge that the fees charged for the Services — where any are charged at all — reflect this allocation of risk, and that these limitations are an essential basis of the bargain between us. Without them, the Services would not be offered.
          </p>
          <p className="mt-2">
            Nothing in these Terms excludes or limits liability that cannot lawfully be excluded or limited, including liability for death or personal injury caused by negligence, for fraud or fraudulent misrepresentation, or for any other liability that applicable law does not permit to be limited. Where a limitation in this Section is held unenforceable, the liability of the Protected Parties shall be limited to the minimum amount permitted by law, and the remainder of this Section shall continue in effect.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">14. Indemnification</h2>
          <p className="mt-2">
            You agree to defend, indemnify, and hold harmless the Protected Parties from and against any and all claims, liabilities, damages, judgments, awards, losses, costs, expenses, or fees (including reasonable legal fees) arising out of or relating to: your use of the Services; your User Content; any output you rely on, publish, or act upon; your breach of these Terms or of any law; your infringement of any third-party right; or any use of the Services for a purpose prohibited by Section 5.
          </p>
          <p className="mt-2">
            We reserve the right, at your expense, to assume the exclusive defence and control of any matter subject to indemnification by you, in which case you agree to cooperate with our defence. You may not settle any matter in a way that imposes any obligation or admission on a Protected Party without our prior written consent.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">15. Time Limit for Claims</h2>
          <p className="mt-2">
            To the maximum extent permitted by applicable law, any claim or cause of action arising out of or relating to these Terms or the Services must be filed within <strong>one (1) year</strong> after the claim arose, or it is permanently barred. Where applicable law does not permit a limitation period to be shortened, this Section does not apply to that claim.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">16. Governing Law &amp; Dispute Resolution</h2>
          <p className="mt-2">
            These Terms and any dispute arising out of or relating to them or the Services are governed by the laws of the United Arab Emirates and, where applicable, the Emirate of Dubai, without regard to conflict-of-law principles. Subject to the paragraphs below, the courts of Dubai shall have exclusive jurisdiction.
          </p>
          <p className="mt-2">
            Before commencing any proceeding, you agree to first contact us in writing at the address in Section 23 and to attempt in good faith to resolve the dispute informally for a period of thirty (30) days. Most concerns can be resolved this way.
          </p>
          <p className="mt-2">
            <strong>Individual claims only.</strong> To the maximum extent permitted by applicable law, you and DAP AI LABS each agree that any dispute will be brought in an individual capacity only, and not as a plaintiff or class member in any purported class, collective, consolidated, or representative proceeding. If this paragraph is held unenforceable as to a particular claim, it remains in force for all other claims.
          </p>
          <p className="mt-2">
            Either party may seek injunctive or other equitable relief in a court of competent jurisdiction to protect its intellectual property or prevent irreparable harm.
          </p>
          <p className="mt-2">
            Nothing in this Section deprives you of the protection of any mandatory consumer-protection provision of the law of your country of residence that cannot be varied by agreement.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">17. Third-Party Services &amp; Links</h2>
          <p className="mt-2">
            The Services may contain links to, or rely on, third-party websites, models, hosting providers, payment processors, or services that are not owned or controlled by DAP AI. We have no control over, and assume no responsibility for, the content, availability, security, privacy policies, or practices of any third party. You acknowledge that DAP AI shall not be responsible or liable, directly or indirectly, for any damage or loss caused or alleged to be caused by or in connection with the use of or reliance on any such third party, including any outage or failure on their part that affects the Services.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">18. Force Majeure</h2>
          <p className="mt-2">
            DAP AI shall not be liable for any failure or delay in performing its obligations under these Terms where such failure or delay results from causes beyond our reasonable control, including but not limited to natural disasters, war, terrorism, riots, embargoes, acts of civil or military authorities, epidemics, fire, floods, accidents, strikes, power or cooling failure, hardware failure, cyber-attack, or failure of telecommunications or internet service providers.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">19. Severability &amp; Waiver</h2>
          <p className="mt-2">
            If any provision of these Terms is held to be invalid, illegal, or unenforceable for any reason, that provision shall be modified to the minimum extent necessary to make it valid and enforceable or, if that is not possible, severed; the remaining provisions shall continue in full force and effect. In particular, the invalidity of any part of Sections 12 to 15 shall not affect the enforceability of the remainder of those Sections.
          </p>
          <p className="mt-2">
            No waiver by us of any term or condition shall be deemed a further or continuing waiver of that term or of any other term, and our failure to assert any right shall not constitute a waiver of it.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">20. Assignment</h2>
          <p className="mt-2">
            You may not assign or transfer these Terms, by operation of law or otherwise, without our prior written consent. Any attempt to do so without consent is null and void. We may freely assign or transfer these Terms, including in connection with a merger, acquisition, or sale of assets. Subject to the foregoing, these Terms bind and benefit the parties and their respective successors and permitted assigns.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">21. Entire Agreement &amp; Relationship</h2>
          <p className="mt-2">
            These Terms, together with our Privacy Policy and any other legal notices published by us on the Services, constitute the entire agreement between you and DAP AI concerning the Services and supersede all prior or contemporaneous understandings, agreements, representations, and warranties, whether written or oral.
          </p>
          <p className="mt-2">
            No agency, partnership, joint venture, employment, or franchise relationship is created by these Terms. There are no third-party beneficiaries other than the Protected Parties, who may enforce Sections 13 and 14.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">22. Data Privacy</h2>
          <p className="mt-2">
            At DAP AI, we take your privacy seriously. We collect and process personal data only as necessary to provide, maintain, and improve the Services. We employ reasonable security measures to protect your information from unauthorised access, disclosure, alteration, or destruction. No system is perfectly secure, however, and we cannot guarantee absolute security.
          </p>
          <p className="mt-2">
            We may share your personal data with trusted third-party service providers who assist us in operating the Services (such as hosting providers and analytics services). These providers are contractually obligated to use your data solely for the purpose of providing services to us and are prohibited from using it for their own purposes.
          </p>
          <p className="mt-2">
            We may also disclose your personal data if required to do so by law or in response to valid requests by public authorities.
          </p>
          <p className="mt-2">
            Do not submit sensitive personal data, confidential information, or the personal data of third parties to the Services. You are responsible for obtaining any consent required before submitting information about another person.
          </p>

        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">23. Contact Information</h2>
          <p className="mt-2">
            If you have any questions about these Terms, or wish to raise a dispute under Section 16, please contact us at pancholiadevansh@gmail.com. We will make every reasonable effort to respond within five (5) business days.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <h2 className="text-lg font-semibold text-foreground">24. Payments, Billing &amp; Refunds</h2>
          <p className="mt-2">
            This Section governs all payments for the Services and applies in addition to the rest of these Terms.
          </p>

          <p className="mt-4 font-medium text-foreground">24.1 Plans</p>
          <p className="mt-2">
            DAP AI offers a free tier (“Lite”) and a paid tier (“Pro”). The free tier is provided at no charge and may be limited, changed, or withdrawn at any time. Pro unlocks the features described on the Services at the time of purchase. Nothing on the Services constitutes an offer capable of acceptance until we confirm your upgrade.
          </p>

          <p className="mt-4 font-medium text-foreground">24.2 How payment is taken</p>
          <p className="mt-2">
            Pro is currently sold for <strong>AED 5</strong>, paid <strong>in person and in cash</strong> to the operator of DAP AI. We do not currently process card payments, store card details, or operate recurring billing. Your account is upgraded manually after payment is received, and an upgrade is not guaranteed to be immediate. If we introduce an online payment method in future, the terms disclosed at the point of purchase will apply in addition to this Section.
          </p>
          <p className="mt-2">
            You are responsible for any taxes, duties, or charges applicable to your purchase other than taxes on our income. Prices are stated in UAE Dirhams (AED) and exclude any such amounts unless stated otherwise.
          </p>

          <p className="mt-4 font-medium text-foreground">24.3 No refunds</p>
          <p className="mt-2 font-medium text-foreground">
            All payments are final and non-refundable, except where a refund is required by applicable law.
          </p>
          <p className="mt-2">
            Because the Services are digital and made available immediately, no refund is given for: a change of mind; failure to use the Services; dissatisfaction with output quality, accuracy, or speed; downtime, interruption, or degraded performance; a change to features, models, plans, or limits; suspension or termination of your account under Section 11; or loss of data under Section 10.
          </p>

          <p className="mt-4 font-medium text-foreground">24.4 Price and plan changes</p>
          <p className="mt-2">
            We may change prices, plan contents, usage quotas, and the features included in any plan at any time. Changes take effect prospectively. Continued use of the Services after a change constitutes acceptance of it. We are not obliged to maintain any plan, price, or feature indefinitely, and no purchase confers a perpetual right to any feature.
          </p>

          <p className="mt-4 font-medium text-foreground">24.5 Disputed payments</p>
          <p className="mt-2">
            If you initiate a chargeback, reversal, or payment dispute, we may immediately suspend or terminate your account and revoke access to paid features pending resolution. You agree to contact us under Section 23 before initiating any dispute with a third party.
          </p>

          <p className="mt-4 font-medium text-foreground">24.6 Liability for payments</p>
          <p className="mt-2">
            Our total liability in connection with any payment is limited as set out in Section 13, and in no circumstances exceeds the amount you actually paid to us. Payment does not create any warranty, service level, guarantee of availability, or guarantee of any particular result, and does not vary any disclaimer or limitation in these Terms.
          </p>
        </div>
      </section>
    </div>
  );
}
