# Privacy and cloud release gates

## Implemented locally

- Versioned, public `/privacy`, `/terms` and `/help` routes and landing links.
- Personal/browser and cloud boundaries disclosed.
- Browser Analytics removed; no advertising tracker is enabled.
- Cloud JSON export, account deletion, member leave, contribution withdrawal, owner transfer and confirmed recursive owned-space deletion.
- Account deletion requires recent authentication and cannot orphan owned spaces.
- Initial cloud age scope is 18+; sensitive-characteristic inference is prohibited.
- Record-level retention targets and data map are documented.

## Requires external action before public cloud launch

1. Publish the controller/operator legal identity, postal address and dedicated privacy/support contact.
2. Confirm lawful bases and complete any legitimate-interest assessments with qualified UK counsel.
3. Complete and sign the DPIA for Network/contact data, optional provider processing and the intended Community use cases. The ICO says a DPIA is required for processing likely to result in high risk: [ICO DPIA guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/data-protection-impact-assessments-dpias/).
4. Keep school/under-18 marketing disabled. Complete the Children's Code/age-appropriate-design screen before changing the 18+ scope: [ICO services covered by the code](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/services-covered-by-this-code/).
5. Review and record Firebase/Google Cloud and Netlify DPAs, regions, subprocessors, transfer mechanism and retention. Do the same for the named AI provider before enabling it.
6. Configure and evidence 30-day cleanup/TTL for expired invitations and rate limits, 90-day rejected-proposal cleanup, 12-month audit/member cleanup and backup expiry no longer than 35 days.
7. Test rights handling with representative access, correction, objection, portability and erasure requests, including a request about a non-user contact.
8. Have the final Privacy Notice and Terms approved. ICO transparency guidance requires controller/contact, purposes, lawful bases, recipients, transfers, retention, rights and complaint information: [ICO right-to-be-informed guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-privacy-information-should-we-provide/).

Until these gates are recorded, cloud routes are Beta/pre-release and unrestricted cloud registration is a stop-ship blocker. Account lifecycle source being present does not itself satisfy legal or processor approval.
