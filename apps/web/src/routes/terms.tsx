import { Link } from "react-router";

export function meta() {
  return [{ title: "Terms — Kiftet" }];
}

/**
 * The student agreement.
 *
 * Like the privacy notice, this copy lives in its own route rather than in the
 * UI catalogue. It is a legal document, not app chrome: it changes when the
 * service changes, it ships in both languages, and every claim in it should be
 * checkable against the code and the privacy notice.
 */
const terms = {
  en: {
    updated: "Last updated 27 October 2026",
    intro:
      "These terms are an agreement between you and Kiftet. They apply when you create an account, continue with Google, Facebook, or GitHub, or use the Kiftet website, app, or study tools. By doing any of those things, you agree to these terms and to our Privacy notice. If you do not agree, please do not use Kiftet.",
    sections: [
      {
        heading: "What Kiftet is",
        body: "Kiftet is a study tool. You explain a textbook chapter in your own words, Kiftet shows you which ideas are missing or confused, gives you a short plan and lesson, and tests you again. Kiftet is in beta. It is a study aid, not an official curriculum, examination body, teacher, or a promise of any grade or result.",
      },
      {
        heading: "Your account",
        body: "Give us accurate information when you sign up. Keep your password and device secure, and do not share your account. One account is for one person. Tell us promptly if you think someone else has access. You are responsible for activity on your account, except where the law says otherwise. If you sign in with Google, Facebook, or GitHub, that provider's terms also apply to the sign-in itself.",
      },
      {
        heading: "Your content and textbooks",
        body: "You keep ownership of the material you upload and the answers you write or speak. You give Kiftet permission to store, process, and send that material to our service providers — including AI model providers — only to run, secure, support, and improve Kiftet. That includes aggregated study signals that do not identify you. Upload only books and material you have the right to use. Do not upload someone else's private information without their permission.",
      },
      {
        heading: "Acceptable use",
        body: "Do not use Kiftet to break the law, harm or impersonate another person, upload malware, scrape or automate the service, reverse engineer it, overload it, or get around usage limits. Do not use it in a way your school or exam rules forbid. We may suspend an account that puts other students, the service, or our providers at risk.",
      },
      {
        heading: "AI and accuracy",
        body: "Kiftet uses AI models to read chapters, find gaps, write lessons, and mark answers. AI can be wrong, incomplete, or out of date. Check important facts against your textbook or teacher, especially before an exam. Kiftet does not provide official exam questions, and a good result in Kiftet is not a guarantee of a good result anywhere else.",
      },
      {
        heading: "Availability and changes",
        body: "Kiftet is a beta service. We may add, change, pause, or remove features, and we do not promise that the service will always be available or error-free. We may update these terms when the service or the law changes. The date at the top shows the current version; if a change is material, we will tell you in the app or by email. Continuing to use Kiftet after a change means you accept the updated terms.",
      },
      {
        heading: "Offers and paid features",
        body: "The waitlist premium month is governed by the offer shown when you join the waitlist. If Kiftet introduces paid features, we will show the price and billing terms before you pay. Nothing in these terms removes a right that consumer law gives you and that cannot be waived.",
      },
      {
        heading: "Ending your use",
        body: "You can stop using Kiftet at any time, and you can delete your account and study data yourself from Settings. We may suspend or end your access if you seriously breach these terms, if your account creates a security risk, or if we are required to by law. When an account is deleted, its study data is deleted too, except for records we must keep to meet a legal obligation or to deal with abuse.",
      },
      {
        heading: "Disclaimers and liability",
        body: "Kiftet is provided “as is” and “as available”. To the extent Ethiopian law allows, we are not liable for indirect or consequential loss, or for decisions you make from a generated lesson, question, or mark. Nothing here limits liability that the law does not allow us to limit, or your rights under Ethiopia's Data Protection Proclamation No. 1321/2024.",
      },
      {
        heading: "Governing law and contact",
        body: "These terms are governed by the laws of the Federal Democratic Republic of Ethiopia. If something goes wrong, message us on Telegram first so we can try to fix it. A dispute that cannot be resolved that way belongs to the courts or authority with jurisdiction in Ethiopia. You can reach us through the Kiftet Telegram community linked from the app.",
      },
    ],
  },
  am: {
    updated: "የመጨረሻ ማሻሻያ፦ 27 ኦክቶበር 2026",
    intro:
      "እነዚህ ውሎች በአንተና በኪፍተት መካከል ያለ ስምምነት ናቸው። መለያ ስትፈጥር፣ በGoogle፣ በFacebook ወይም በGitHub ስትቀጥል፣ ወይም የኪፍተትን ድህረ ገጽ፣ መተግበሪያ ወይም የጥናት መሳሪያዎች ስትጠቀም ይሠራሉ። ከእነዚህ ውስጥ አንዱን በማድረግህ በእነዚህ ውሎችና በግላዊነት ማስታወቂያችን ትስማማለህ። ካልተስማማህ፣ እባክህ ኪፍተትን አትጠቀም።",
    sections: [
      {
        heading: "ኪፍተት ምን ነው",
        body: "ኪፍተት የጥናት መሳሪያ ነው። የመማሪያ መጽሐፍ ምዕራፍን በራስህ ቃላት ታብራራለህ፣ ኪፍተት የጎደሉ ወይም የተምታቱ ሃሳቦችን ያሳያል፣ አጭር ፕላንና ትምህርት ይሰጣል፣ ከዚያ እንደገና ይፈትንሃል። ኪፍተት በቤታ ውስጥ ነው። የጥናት እርዳታ ነው፣ ይፋዊ ስርዓተ ትምህርት፣ የፈተና ቦርድ፣ አስተማሪ ወይም የውጤት ቃል አይደለም።",
      },
      {
        heading: "መለያህ",
        body: "ስትመዘገብ ትክክለኛ መረጃ ስጥ። የይለፍ ቃልህንና መሣሪያህን ጠብቅ፣ መለያህንም አትካፈል። አንድ መለያ ለአንድ ሰው ነው። ሌላ ሰው መግባቱን ካሰብክ ወዲያውኑ ንገረን። በሕግ በማይጠየቅበት ሁኔታ በመለያህ ላይ የሚደረግ እንቅስቃሴ ኃላፊነትህ ነው። በGoogle፣ በFacebook ወይም በGitHub የምትገባ ከሆነ የዚያ አገልግሎት ውሎችም ለመግቢያው ይሠራሉ።",
      },
      {
        heading: "ያስገባሃቸው ይዘቶችና መጽሐፍት",
        body: "ያስገባሃቸው ይዘቶችና የጻፍካቸው ወይም የተናገርካቸው መልሶች ባለቤትነትህ ነው። ኪፍተትን ለማስኬድ፣ ለመጠበቅ፣ ለመደገፍና ለማሻሻል ብቻ ያንን ይዘት እንዲያስቀምጥ፣ እንዲያካሂድና ለአገልግሎት አቅራቢዎቻችን — የAI ሞዴል አቅራቢዎችን ጨምሮ — እንዲልክ ለኪፍተት ፈቃድ ትሰጣለህ። ይህ አንተን የማይለይ የጥናት ምልክቶችን በቡድን መልክ መጠቀምንም ያካትታል። የማምጣት መብት ያለህን መጽሐፍና ይዘት ብቻ አስገባ። የሌላ ሰው የግል መረጃ ያለፈቃዱ አታስገባ።",
      },
      {
        heading: "ተቀባይነት ያለው አጠቃቀም",
        body: "ኪፍተትን ሕግ ለመጣስ፣ ሰውን ለመጉዳት ወይም ራስን እንደሌላ ሰው ለማሳየት፣ መጥፎ ፕሮግራም ለማስገባት፣ አገልግሎቱን በራስ-ሰር ለመቃኘት ወይም ለመቆጣጠር፣ መዋቅሩን ለመፍታት፣ አቅሙን ለማልበስ ወይም የአጠቃቀም ገደቦችን ለማለፍ አትጠቀም። ትምህርት ቤትህ ወይም የፈተና ደንብ በሚከለክለው መንገድም አትጠቀም። ሌሎች ተማሪዎችን፣ አገልግሎቱን ወይም አቅራቢዎቻችንን አደጋ ላይ የሚጥል መለያ ልንገድብ እንችላለን።",
      },
      {
        heading: "AI እና ትክክለኛነት",
        body: "ኪፍተት ምዕራፎችን ለማንበብ፣ ክፍተቶችን ለማግኘት፣ ትምህርት ለመጻፍና መልሶችን ለመመዘን የAI ሞዴሎችን ይጠቀማል። AI ሊሳሳት፣ ያልተሟላ ወይም ጊዜው ያለፈበት ሊሆን ይችላል። በተለይ ከፈተና በፊት ጠቃሚ እውነታዎችን ከመጽሐፍህ ወይም ከአስተማሪህ ጋር አመሳክር። ኪፍተት ይፋዊ የፈተና ጥያቄዎችን አይሰጥም፣ በኪፍተት ውስጥ የተገኘ ጥሩ ውጤትም በሌላ ቦታ ጥሩ ውጤት ዋስትና አይደለም።",
      },
      {
        heading: "አገልግሎትና ለውጦች",
        body: "ኪፍተት የቤታ አገልግሎት ነው። ባህሪያትን ልንጨምር፣ ልንለውጥ፣ ላፋጭብ ወይም ልናስወግድ እንችላለን፤ አገልግሎቱ ሁልጊዜ ይገኛል ወይም ስህተት አይኖረውም ብለን ቃል አንገባም። አገልግሎቱ ወይም ሕጉ ሲለወጥ እነዚህን ውሎች ልናሻሽል እንችላለን። ከላይ ያለው ቀን የአሁኑን ቅጂ ያሳያል፤ ለውጡ ጉልህ ከሆነ በመተግበሪያው ወይም በኢሜይል እናሳውቅሃለን። ከለውጡ በኋላ ኪፍተትን መጠቀምህን ከቀጠልክ የተሻሻሉትን ውሎች ተቀብለካል ማለት ነው።",
      },
      {
        heading: "ቅናሾችና የሚከፈልባቸው ባህሪያት",
        body: "የመስተጀት ዝርዝሩ የክፍል ወር በዝርዝሩ ላይ ስትገባ በሚታየው የቅናሽ ውል ይተዳደራል። ኪፍተት የሚከፈልባቸው ባህሪያትን ካስተዋወቀ፣ ከመክፈልህ በፊት ዋጋውንና የክፍያ ውሎችን እናሳያለን። በእነዚህ ውሎች ውስጥ የሸማች ሕግ የሚሰጥህንና መተው የማይቻልበትን መብት የሚያስወግድ ነገር የለም።",
      },
      {
        heading: "አጠቃቀምህን ማቆም",
        body: "በማንኛውም ጊዜ ኪፍተትን መጠቀም ማቆም ትችላለህ፣ መለያህንና የጥናት መረጃህንም ከቅንብሮች ራስህ ማጥፋት ትችላለህ። እነዚህን ውሎች በከባድ መንገድ ከጣስክ፣ መለያህ የደህንነት አደጋ ካስከተለ ወይም በሕግ ከተገደድን መግቢያህን ልናግድ ወይም ልናቆም እንችላለን። መለያ ሲጠፋ የጥናት መረጃውም ይጠፋል፣ በሕግ ማስቀመጥ ያለብን መዝገብ ወይም የአጠቃቀም ጥሰትን ለማጣራት የሚያስፈልግ ካልሆነ በስተቀር።",
      },
      {
        heading: "ኃላፊነት ማስተባበያ",
        body: "ኪፍተት “እንዳለው” እና “በሚገኝበት ሁኔታ” ይሰጣል። የኢትዮጵያ ሕግ በሚፈቅደው መጠን፣ በተዘዋዋሪ ወይም ተከታይ ኪሳራ፣ ወይም ከተፈጠረ ትምህርት፣ ጥያቄ ወይም ነጥብ በመነሳት ለምትወስደው ውሳኔ ተጠያቂ አንሆንም። በሕግ ልንገድበው የማይቻልን ኃላፊነት ወይም በኢትዮጵያ የመረጃ ጥበቃ ረቂቅ ሕግ ቁጥር 1321/2024 የተሰጠህን መብት የሚገድብ ነገር በዚህ ውስጥ የለም።",
      },
      {
        heading: "የሚመራው ሕግና ግንኙነት",
        body: "እነዚህ ውሎች በኢትዮጵያ ፌዴራላዊ ዲሞክራሲያዊ ሪፐብሊክ ሕጎች ይመራሉ። ችግር ካጋጠመህ መጀመሪያ በቴሌግራም መልእክት ላክልን፣ ልናስተካክለው እንሞክራለን። በዚህ መንገድ ያልተፈታ ክርክር በኢትዮጵያ ስልጣን ላላቸው ፍርድ ቤቶች ወይም ባለስልጣን ይቀርባል። በመተግበሪያው ላይ ከተገናኘው የኪፍተት የቴሌግራም ማህበረሰብ አግኝተን መገናኘት ትችላለህ።",
      },
    ],
  },
} as const;

export default function Terms() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-16">
      <h1 className="font-display font-semibold text-3xl tracking-[-0.02em]">
        Terms of use
      </h1>

      {/*
        Both languages render. A person cannot agree to terms they cannot read,
        and Kiftet is used in both scripts by design.
      */}
      {(["en", "am"] as const).map((lang) => (
        <section key={lang} className="mt-10">
          <h2 className="text-muted-foreground text-xs uppercase tracking-wide">
            {lang === "en" ? "English" : "አማርኛ"}
          </h2>
          <p className="mt-3 leading-7">{terms[lang].intro}</p>
          <p className="mt-2 text-muted-foreground text-sm">
            {terms[lang].updated}
          </p>
          <dl className="mt-8 space-y-6">
            {terms[lang].sections.map((section) => (
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

      <p className="mt-12 flex flex-wrap gap-x-5 gap-y-2">
        <Link
          to="/privacy"
          className="text-gold underline-offset-4 hover:underline"
        >
          Privacy
        </Link>
        <Link to="/" className="text-gold underline-offset-4 hover:underline">
          ← Kiftet
        </Link>
      </p>
    </main>
  );
}
