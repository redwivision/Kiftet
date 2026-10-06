import { Link } from "react-router";

export function meta() {
  return [{ title: "Privacy — Kiftet" }];
}

/**
 * Privacy notice for the launch waitlist.
 *
 * This copy lives here rather than in `messages.ts` on purpose. It is a legal
 * document, not app chrome: it gets rewritten when the data actually changes,
 * and it changes on its own schedule. Burying it in a 1,200-line UI catalogue
 * with everything from button labels to study copy makes it the one page nobody
 * thinks to open when a question comes up. It still ships in both languages —
 * Amharic is not optional just because the words are legal.
 *
 * Every claim below is something the code actually does. There is no
 * "we may share with partners" clause, because there are no partners.
 */
const notice = {
  en: {
    updated: "Last updated 5 October 2026",
    intro:
      "This notice covers the Kiftet launch waitlist. If you use Kiftet as a student, that is covered by the notice shown when you sign up.",
    sections: [
      {
        heading: "What we collect",
        body: "Your name, your mobile number, and the language you picked. We also record that you agreed to be contacted, and the date. If you connect Telegram, we store the Telegram account identifier that identifies you to us.",
      },
      {
        heading: "Why we collect it",
        body: "To tell you, once, that Kiftet has launched. That is the whole purpose. Your number is not sold, not used for advertising, and not shared with anyone else. Your phone number is the key we use to recognise you if you come back on the same phone, so submitting the form twice does not put you on the list twice.",
      },
      {
        heading: "The premium month",
        body: "You get one month of premium at launch if you join our Telegram channel and send us a line about what you found in the demo. This is a condition of the offer, and we would rather say so plainly than have you discover it later. If you join the waitlist and do not do both things, you still keep your place — you just do not get the premium month. The offer is not conditional on you saying anything nice about us.",
      },
      {
        heading: "Your testimonial",
        body: "If you send us a line, we keep it and we read it. We do not publish anything without asking you first, and you can ask us to delete it at any time. If we do publish it, we will show it as words, never with your Telegram handle, phone number, or name unless you specifically ask us to.",
      },
      {
        heading: "How long we keep it",
        body: "Until Kiftet launches, and until you have had a reasonable chance to claim your premium month. After that we delete the waitlist, unless you have asked us to keep your testimonial or you are using Kiftet as a student, in which case the rules for that apply instead.",
      },
      {
        heading: "Deleting your data",
        body: "Message us on Telegram, or reply to any message we sent you, and ask. We will delete your waitlist entry and your testimonial. We do not ask you to prove who you are first — we can see who you are from the message you are writing from.",
      },
      {
        heading: "Your rights",
        body: "Ethiopia's Data Protection Proclamation No. 1321/2024 gives you the right to see what we hold about you, correct it, delete it, and object to us using it. The message above is enough to exercise any of those. If you think we have handled it badly, you can complain to the competent Ethiopian authority.",
      },
    ],
  },
  am: {
    updated: "የመጨረሻ ማሻሻያ የተዘጋጀው፦ 5 ኦክቶበር 2026",
    intro:
      "ይህ ማስጠንቀቂያ ለኪፍተት የመስተጀት ዝርዝር ነው። ኪፍተትን እንደሰማሪ ከሆንህ፣ የመግቢያ ጊዜ ምልክት ማየትን እንሽላለን።",
    sections: [
      {
        heading: "ምን እንሰብስባለን",
        body: "ስምህ፣ የሞባይል ቁጥርህና የመረጡትን ቋንቋ። በጣት እንደሆንህ እንደተስማምን እና ቀኑንም ይመዝግባለን። ካገናኝት ቴሌግራም ተጠቃሚውን ለማስረጋገጥ የሚያገለግለን መለያ እና ያስቀምጣለን።",
      },
      {
        heading: "ለምን እንሰብስባለን",
        body: "ኪፍተት የተጀመረበትን አንድ ጊዜ ለማሳወቅ ብቻ። የዚያው ዓላማ ሙሉ በሙሉ ነው። ቁጥርህ አይቀይርም፣ ለማስታወቂያ አይጠቀሙም፣ ማንም ሌላ ከእኛ ጋር አይጋራም። በሞባይልዎ ሲመለስ ተመሳሳይ ቁጥር ስትገባ በዝርዝር ላይ ሁለት ጊዜ አይገባም።",
      },
      {
        heading: "የክፍል ወርቱ",
        body: "የቴሌግራም ቻናላችን ካቀለጡና ከማሳያው ውስጥ ያገኙትን በአንድ ወረፍ ካሳወቅን፣ በመስተጀት ቀን አንድ ወር ክፍል ጥሩ ያገኛህ። ይህ የሆነት ሁኔታ ነው፣ እና አላውጡም። ወደ ዝርዝሩ ቢገባ ሁለቱንም ካልጠናቀቅ ቦታህን በዝርዝሩ ላይ ይቆጣሉ፤ ክፍል ወር አይሰጥም። ያለንን ጥሩ ብለህ መናገር የማይቀርጠው ተግዴማዊ ሁኔታ አይደለም።",
      },
      {
        heading: "የእርስህ መግለጫ",
        body: "አንድ ወረፍ ከላኩህ ያስቀምጣለንና እናምናለን። ከመጠየቅህ በፊት ምንም አንትም፤ ማስገጠር ስትፈልግህ በማንኛውም ጊዜ መሰረዝር እንደምንር። ካስተወጥን ትርጉምህን በቃላት፣ አይያልንም የቴሌግራም ስምህ፣ ቁጥርህ ወይም ስምህ ካልጠየቅን ብቻ እንሳስታያለን።",
      },
      {
        heading: "ለመቶ ቅደም ተከተላችን",
        body: "ኪፍተት እስኪጀምር ድረስ እና ክፍል ወርህን የሚያስፈልግበትን ተመልክተን አካል ጊዜ ከዚያ በኋላ። ከዚያ ዝርዝሩን እናጠርተን ያስወግዳለን — ሆኖም ተጠየቀውን ተጠቃሚ ከሆንህ ወይም የኪፍተትን ሰማሪ ከሆንህ በላይ ያለው ህግድ ይተግብራል።",
      },
      {
        heading: "መረጃዎን መድረስ",
        body: "በቴሌግራም መልእክት ላንተኝ፣ ወይም የላንተውን መልስ ላንተኝ ብለህ አስጠየቅኝ። የዝርዝር ግብዎንና ተጠቃሚዎን እንደምንር። መለያህን ለማረጋገጥ አንጠይቅም — የላከውን መልእክት ከምንር በራሱ ስለሚታወቅ ነው።",
      },
      {
        heading: "መብትህ",
        body: "የኢትዮጵያ የመረጃ ጥበቃ ሰላም ምልክት ቁጥር 1321/2024 ስለእኛ ያለህ የመረጃውን ማየት፣ ማስተካከል፣ መድረስና አጠቃቀም ላይ መተትተርነት ይሰጣል። ለላንተው መልእክት ማንቀሳቀስ በቂ ነው። በደንብ ካልተሳራገመን ሳትበሉ፣ ለኢትዮጵያ ያለው እርስና ተሳዳይ ባለስልርቱን ቅሬታ ማቅረብ ይችላሉ።",
      },
    ],
  },
} as const;

export default function Privacy() {
  const copy = notice.en;

  return (
    <main className="mx-auto max-w-2xl px-5 py-16">
      <h1 className="font-display font-semibold text-3xl tracking-[-0.02em]">
        Privacy — launch waitlist
      </h1>
      <p className="mt-2 text-muted-foreground text-sm">{copy.updated}</p>

      {/*
        Both languages render. A notice a person can't read is not consent, and
        the waitlist collects Amharic speakers by design.
      */}
      {(["en", "am"] as const).map((lang) => (
        <section key={lang} className="mt-10">
          <h2 className="text-muted-foreground text-xs uppercase tracking-wide">
            {lang === "en" ? "English" : "አማርኛ"}
          </h2>
          <p className="mt-3 leading-7">{notice[lang].intro}</p>
          <dl className="mt-8 space-y-6">
            {notice[lang].sections.map((section) => (
              <div key={section.heading}>
                <dt className="font-medium">{section.heading}</dt>
                <dd className="mt-1 text-muted-foreground leading-7">
                  {section.body}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      <p className="mt-12">
        <Link to="/" className="text-gold underline-offset-4 hover:underline">
          ← Kiftet
        </Link>
      </p>
    </main>
  );
}
