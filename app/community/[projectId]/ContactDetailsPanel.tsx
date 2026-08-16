import type { CommunityItem, CommunityList } from "../../cloud/types";

type ContactDetailsPanelProps = {
  item: CommunityItem;
  list: CommunityList;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function hrefFor(value: string) {
  const valueText = text(value);
  if (!valueText) return "";
  if (/^https?:\/\//i.test(valueText)) return valueText;
  if (/^www\./i.test(valueText)) return `https://${valueText}`;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(?:\/.*)?$/i.test(valueText)) return `https://${valueText}`;
  return "";
}

function labelFromKey(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

function normalizedKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const hiddenCustomFields = new Set([
  "rawmessage",
  "rawtext",
  "sourcemessage",
  "sourcetext",
  "sourcemessageid",
  "evidenceids",
]);

const knownFields = new Set([
  "services",
  "communityfeedback",
  "feedback",
  "recommendation",
  "confidence",
  "evidencecount",
  "latestmention",
  "historicpricing",
  "historicpricingavailability",
  "availability",
  "providerid",
]);

function customValue(item: CommunityItem, ...keys: string[]) {
  const entries = Object.entries(item.customFields || {});
  for (const key of keys) {
    const wanted = normalizedKey(key);
    const match = entries.find(([candidate]) => normalizedKey(candidate) === wanted);
    if (match && text(match[1])) return text(match[1]);
  }
  return "";
}

function socialField(key: string) {
  return /(facebook|instagram|linkedin|twitter|xcom|tiktok|youtube|social)/i.test(key);
}

function confidenceClass(value: string) {
  const lower = value.toLowerCase();
  if (lower.includes("high")) return "high";
  if (lower.includes("low") || lower.includes("caution")) return "low";
  return "medium";
}

function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "contact-profile-field wide" : "contact-profile-field"}>
      <small>{label}</small>
      <div>{children}</div>
    </div>
  );
}

export default function ContactDetailsPanel({ item, list }: ContactDetailsPanelProps) {
  const website = text(item.url || item.website);
  const services = text(item.details) || customValue(item, "services");
  const communityFeedback = customValue(item, "communityFeedback", "feedback", "recommendation");
  const confidence = customValue(item, "confidence");
  const evidenceCount = customValue(item, "evidenceCount");
  const latestMention = customValue(item, "latestMention");
  const historicPricing = customValue(item, "historicPricing", "historicPricingAvailability");
  const availability = customValue(item, "availability");
  const providerId = customValue(item, "providerId");

  const customEntries = Object.entries(item.customFields || {})
    .map(([key, value]) => [key, text(value)] as const)
    .filter(([, value]) => Boolean(value));

  const socialLinks = customEntries.filter(([key, value]) => socialField(key) && Boolean(hrefFor(value)));

  const otherCustomFields = customEntries.filter(([key]) => {
    const normalized = normalizedKey(key);
    return !hiddenCustomFields.has(normalized) && !knownFields.has(normalized) && !socialField(key);
  });

  return (
    <div className="contact-profile">
      <div className="contact-profile-actions">
        {item.phone && (
          <a className="contact-action primary" href={`tel:${item.phone}`}>
            <span>Call</span>
            <strong>{item.phone}</strong>
          </a>
        )}
        {item.email && (
          <a className="contact-action" href={`mailto:${item.email}`}>
            <span>Email</span>
            <strong>{item.email}</strong>
          </a>
        )}
        {website && hrefFor(website) && (
          <a className="contact-action" href={hrefFor(website)} target="_blank" rel="noreferrer">
            <span>Website</span>
            <strong>Open link ↗</strong>
          </a>
        )}
      </div>

      <section className="contact-profile-section">
        <header>
          <p className="contact-profile-section-kicker">Contact</p>
          <h3>Contact details</h3>
        </header>
        <div className="contact-profile-grid">
          <Field label="Phone">
            {item.phone ? <a href={`tel:${item.phone}`}>{item.phone}</a> : <span className="contact-missing">Not provided</span>}
          </Field>
          <Field label="Email">
            {item.email ? <a href={`mailto:${item.email}`}>{item.email}</a> : <span className="contact-missing">Not provided</span>}
          </Field>
          {website && (
            <Field label="Website / web link" wide>
              {hrefFor(website) ? (
                <a href={hrefFor(website)} target="_blank" rel="noreferrer">{website} ↗</a>
              ) : (
                <span>{website}</span>
              )}
            </Field>
          )}
          {item.address && <Field label="Address" wide><span>{item.address}</span></Field>}
          {item.openingInformation && <Field label="Opening / availability" wide><span>{item.openingInformation}</span></Field>}
        </div>
      </section>

      {(services || communityFeedback || historicPricing || availability) && (
        <section className="contact-profile-section">
          <header>
            <p className="contact-profile-section-kicker">Community information</p>
            <h3>What the Community knows</h3>
          </header>
          <div className="contact-profile-grid">
            {services && <Field label="Services" wide><span>{services}</span></Field>}
            {communityFeedback && <Field label="Community feedback" wide><span>{communityFeedback}</span></Field>}
            {historicPricing && <Field label="Historic pricing / availability" wide><span>{historicPricing}</span></Field>}
            {availability && <Field label="Availability" wide><span>{availability}</span></Field>}
          </div>
          {(confidence || evidenceCount || latestMention) && (
            <div className="contact-evidence-strip">
              {confidence && <span className={`contact-confidence ${confidenceClass(confidence)}`}>{confidence} confidence</span>}
              {evidenceCount && <span>{evidenceCount} {evidenceCount === "1" ? "community mention" : "community mentions"}</span>}
              {latestMention && <span>Last mentioned {latestMention}</span>}
            </div>
          )}
        </section>
      )}

      {socialLinks.length > 0 && (
        <section className="contact-profile-section">
          <header>
            <p className="contact-profile-section-kicker">Online</p>
            <h3>Social media</h3>
          </header>
          <div className="contact-social-links">
            {socialLinks.map(([key, value]) => (
              <a key={key} href={hrefFor(value)} target="_blank" rel="noreferrer">
                <span>{labelFromKey(key)}</span>
                <strong>Open ↗</strong>
              </a>
            ))}
          </div>
        </section>
      )}

      {(item.notes || providerId || otherCustomFields.length > 0) && (
        <section className="contact-profile-section">
          <header>
            <p className="contact-profile-section-kicker">More</p>
            <h3>Additional information</h3>
          </header>
          <div className="contact-profile-grid">
            {item.notes && <Field label="Notes" wide><span>{item.notes}</span></Field>}
            {providerId && <Field label="Directory reference"><span>{providerId}</span></Field>}
            {otherCustomFields.map(([key, value]) => (
              <Field key={key} label={labelFromKey(key)} wide={value.length > 48}>
                <span>{value}</span>
              </Field>
            ))}
          </div>
        </section>
      )}

      <footer className="contact-profile-footer">
        <div>
          <small>Category</small>
          <strong>{item.category || list.title}</strong>
        </div>
        <div>
          <small>Community section</small>
          <strong>{list.title}</strong>
        </div>
        <p>Community-supplied information can change. Confirm availability, pricing and credentials directly with the provider before booking work.</p>
      </footer>
    </div>
  );
}
