import { Link } from "react-router";

export function meta() {
  return [{ title: "Privacy — Kiftet" }];
}

/**
 * Privacy notice for students and the launch waitlist.
 *
 * This copy lives here rather than in `messages.ts` on purpose. It is a legal
 * document, not app chrome: it gets rewritten when the data actually changes,
 * and it changes on its own schedule. Burying it in a 1,200-line UI catalogue
 * with everything from button labels to study copy makes it the one page nobody
 * thinks to open when a question comes up. It still ships in both languages —
 * Amharic is not optional just because the words are legal.
 *
 * Every claim below is something the code actually does. There is no
 * "we may share with partners" clause, because there are no partners. The
 * waitlist and student notices are separate because the data and the basis for
 * holding it are different, even though both are Kiftet.
 */
const notice = {
  en: {
    updated: "Last updated 27 October 2026",
    intro:
      "This notice explains what Kiftet collects, why we hold it, and what you can do about it. It covers the student app and the launch waitlist. If you use both, both parts apply to you.",
    students: {
      heading: "If you have a Kiftet account",
      intro:
        "Kiftet is a study tool. It works on the chapters you give it, and it keeps the study record that makes your plan, lessons, and progress possible.",
      sections: [
        {
          heading: "What we collect",
          body: "Account details: your name, your email address, and a hashed password, or the Google, Facebook, or GitHub account you use to sign in. Study details: the books and chapters you add, the text Kiftet reads from them, the answers you speak or type, the gaps and scores Kiftet finds, your study plan and progress, and settings such as your exam date and study length. Technical details: your IP address and browser information when you sign in, so we can keep sessions secure and prevent abuse. Device storage: your language, theme, demo and waitlist identifiers, and intro and install preferences stay in your browser.",
        },
        {
          heading: "Your voice",
          body: "Kiftet does not record or store audio. When you speak, your browser's speech recognition turns your voice into text. That text is sent to Kiftet and stored with your study attempt. The audio itself is handled by your browser, and possibly by your browser's speech provider under its own terms, not by Kiftet. You can always type instead.",
        },
        {
          heading: "Why we use it",
          body: "To create and secure your account; read the chapter you add and find its ideas; diagnose what you remember; build your plan, lesson, and questions; show your progress; provide support; prevent abuse and stay within AI limits; and understand in aggregate which ideas students miss so the study experience improves. We do not sell your data or use it for advertising.",
        },
        {
          heading: "AI and other service providers",
          body: "To run the study loop, we send the chapter text and your recall transcript to AI model providers — currently Google Gemini and Groq. They process it to return the diagnosis, lesson, and questions, and their handling is also governed by their own terms. We also use infrastructure providers for hosting and the database. Kiftet does not use your content for advertising, and we do not share your data with data brokers. We may disclose data if the law requires it or to protect a person's safety.",
        },
        {
          heading: "Cookies and device storage",
          body: "Kiftet uses essential cookies only: the session cookie that keeps you signed in, plus short-lived cookies the sign-in flow needs. We also use browser storage for your preferences (language and theme), a local waitlist or demo identifier, and a flag that the intro was seen. A service worker caches app files, and the app stores study material in your browser's database, so Kiftet can work offline. We do not use advertising cookies, cross-site tracking pixels, or third-party analytics. Because we only use essential storage, there is no consent banner to dismiss.",
        },
        {
          heading: "How long we keep it",
          body: "We keep your account and study record while your account is open. You can delete your account from Settings, and that deletes the account and its study data. We may keep a limited record longer where the law requires it, or where needed to investigate abuse or a security incident. Waitlist data follows the separate section below.",
        },
        {
          heading: "Your rights",
          body: "Ethiopia's Data Protection Proclamation No. 1321/2024 gives you the right to access, correct, delete, and object to the processing of your personal data. You can delete your account yourself in Settings; for the other rights, message us on Telegram. We may need to confirm that the account is yours. You can also complain to the competent Ethiopian authority.",
        },
        {
          heading: "Security",
          body: "We use HTTPS, hashed passwords, and access controls. No service is perfectly secure. If you think your account is compromised, reset your password and tell us.",
        },
        {
          heading: "Changes to this notice",
          body: "We may update this notice. We will change the date above and, for material changes, tell you in the app or by email. Continuing to use Kiftet after a change means the updated notice applies.",
        },
      ],
    },
    waitlist: {
      heading: "If you joined the launch waitlist",
      intro:
        "The waitlist is separate from a student account. It exists to tell you once when Kiftet launches, and to run the launch offer described below.",
      sections: [
        {
          heading: "What we collect",
          body: "Your name, your mobile number, and the language you picked. We also record that you agreed to be contacted, the date, and the version of the notice you agreed to. If you connect Telegram, we store the Telegram account identifier that identifies you to us. If you send us a testimonial, we store that text.",
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
          body: "Until Kiftet launches, and until you have had a reasonable chance to claim your premium month. After that we delete the waitlist, unless you have asked us to keep your testimonial or you are using Kiftet as a student, in which case the student rules apply instead.",
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
  },
  am: {
    updated: "የመጨረሻ ማሻሻያ፦ 27 ኦክቶበር 2026",
    intro:
      "ይህ ማስታወቂያ ኪፍተት ምን እንደሚሰበስብ፣ ለምን እንደሚያስቀምጥና ምን ማድረግ እንደምትችል ያብራራል። የተማሪውን መተግበሪያና የመስተጀት ዝርዝሩን ይሸፍናል። ሁለቱንም ከተጠቀምክ ሁለቱም ክፍሎች ይሠራሉ።",
    students: {
      heading: "የኪፍተት መለያ ካለህ",
      intro:
        "ኪፍተት የጥናት መሳሪያ ነው። በምታስገባቸው ምዕራፎች ላይ ይሠራል፣ ፕላንህ፣ ትምህርትህና እድገትህ እንዲቻል የሚያደርገውን የጥናት መዝገብም ያስቀምጣል።",
      sections: [
        {
          heading: "ምን እንሰበስባለን",
          body: "የመለያ መረጃ፦ ስምህ፣ ኢሜይልህና የተመሰጠረ የይለፍ ቃል፣ ወይም ለመግቢያ የተጠቀምከው የGoogle፣ የFacebook ወይም የGitHub መለያ። የጥናት መረጃ፦ ያከልካቸው መጽሐፍትና ምዕራፎች፣ ኪፍተት ካነበባቸው የጽሑፍ ክፍሎች፣ የተናገርካቸው ወይም የጻፍካቸው መልሶች፣ ኪፍተት ያገኘው ክፍተቶችና ነጥቦች፣ የጥናት ፕላንና እድገትህ፣ እንደ የፈተና ቀንና የጥናት ቆይታ ያሉ ቅንብሮች። የቴክኒክ መረጃ፦ ስትገባ የIP አድራሻህና የአሳሽ መረጃ፣ ክፍለ ጊዜዎችን ለመጠበቅና አላግባብ መጠቀምን ለመከላከል። በመሣሪያህ ላይ የሚቀመጥ፦ ቋንቋህ፣ ገጽታህ፣ የማሳያና የዝርዝር መለያዎች፣ የመግቢያና የመጫኛ ምርጫዎች በአሳሽህ ውስጥ ይቆያሉ።",
        },
        {
          heading: "ድምጽህ",
          body: "ኪፍተት ድምጽ አይቀርጽም፣ አያስቀምጥም። ስትናገር የአሳሽህ የንግግር መለያ ድምጽህን ወደ ጽሑፍ ይቀይራል። ያ ጽሑፍ ወደ ኪፍተት ይላካልና ከጥናት ሙከራህ ጋር ይቀመጣል። ድምጹ ራሱ በአሳሽህ — እና ምናልባት በአሳሽህ የንግግር አቅራቢ በራሱ ውሎች — ይስተናገዳል፣ በኪፍተት አይደለም። ሁልጊዜ በመጻፍ መተካት ትችላለህ።",
        },
        {
          heading: "ለምን እንጠቀማለን",
          body: "መለያ ለመፍጠርና ለመጠበቅ፤ ያከልከውን ምዕራፍ ለማንበብና ሃሳቦቹን ለማግኘት፤ ያስታወስከውን ለመመርመር፤ ፕላንህን፣ ትምህርትህንና ጥያቄዎችህን ለመገንባት፤ እድገትህን ለማሳየት፤ ድጋፍ ለመስጠት፤ አላግባብ መጠቀምን ለመከላከልና በAI ገደቦች ውስጥ ለመቆየት፤ ተማሪዎች የትኞቹን ሃሳቦች እንደሚያመልጡዎት በቡድን ለመረዳትና የጥናት ተሞክሮን ለማሻሻል እንጠቀማለን። መረጃህን አንሸጥም፣ ለማስታወቂያም አንጠቀምበትም።",
        },
        {
          heading: "AI እና ሌሎች አገልግሎት አቅራቢዎች",
          body: "የጥናት ዑደቱን ለማስኬድ የምዕራፉን ጽሑፍና የትውስታ መልስህን ጽሑፍ ለAI ሞዴል አቅራቢዎች — በአሁኑ ጊዜ Google Gemini እና Groq — እንልካለን። እነሱ ምርመራውን፣ ትምህርቱንና ጥያቄዎቹን ለመመለስ ያካሂዳሉ፤ አያያዛቸውም በራሳቸው ውሎች ይተዳደራል። ለአስተናጋጅነትና ለመረጃ ቋትም የመሠረተ ልማት አቅራቢዎችን እንጠቀማለን። ኪፍተት ይዘትህን ለማስታወቂያ አይጠቀምበትም፣ መረጃህንም ለመረጃ ደላላዎች አንሰጥም። ሕግ ከጠየቀ ወይም የሰውን ደህንነት ለመጠበቅ ካስፈለገ መረጃ ልናሳውቅ እንችላለን።",
        },
        {
          heading: "ኩኪዎችና የመሣሪያ ማከማቻ",
          body: "ኪፍተት አስፈላጊ የሆኑ ኩኪዎችን ብቻ ይጠቀማል፦ እንዲገባህ የሚያደርገው የክፍለ ጊዜ ኩኪ፣ እና የመግቢያ ሂደቱ የሚፈልጋቸው አጭር ጊዜ የሚቆዩ ኩኪዎች። የአሳሽ ማከማቻንም ለቅንብሮች (ቋንቋ፣ ገጽታ)፣ ለአካባቢያዊ የዝርዝር/የማሳያ መለያና የመግቢያ ማስታወሻ እንጠቀማለን። የአገልግሎት ሠራተኛው የመተግበሪያ ፋይሎችን ያስቀምጣል፣ መተግበሪያውም የጥናት ይዘትን በአሳሽህ መረጃ ቋት ውስጥ ስለሚያስቀምጥ ኪፍተት ከመስመር ውጭ መሥራት ይችላል። የማስታወቂያ ኩኪዎች፣ የመከታተያ ፒክሰሎች ወይም የሶስተኛ ወገን ትንታኔ አንጠቀምም። አስፈላጊ ማከማቻ ብቻ ስለምንጠቀም የሚዘጋ የስምምነት መስኮት የለም።",
        },
        {
          heading: "ለምን ያህል ጊዜ እናስቀምጣለን",
          body: "መለያህ ክፍት ሆኖ እስካለ ድረስ መለያህንና የጥናት መዝገብህን እናስቀምጣለን። መለያህን ከቅንብሮች ራስህ ማጥፋት ትችላለህ፤ ይህም መለያውንና የጥናት መረጃውን ያጠፋል። ሕግ ስለሚያስፈልገን ወይም አላግባብ መጠቀምን ወይም የደህንነት ክስተትን ለማጣራት አነስተኛ መዝገብ ለተወሰነ ጊዜ ልናስቀምጥ እንችላለን። የመስተጀት ዝርዝር መረጃ ከታች ባለው ክፍል ይተዳደራል።",
        },
        {
          heading: "መብትህ",
          body: "የኢትዮጵያ የመረጃ ጥበቃ ረቂቅ ሕግ ቁጥር 1321/2024 የግል መረጃህን የማየት፣ የማስተካከል፣ የማጥፋትና አጠቃቀሙን የመቃወም መብት ይሰጣል። መለያህን ከቅንብሮች ራስህ ማጥፋት ትችላለህ፤ ለሌሎቹ መብቶች በቴሌግራም መልእክት ላክልን። መለያው የአንተ መሆኑን ማረጋገጥ ልንፈልግ እንችላለን። በተጨማሪም ለሚመለከተው የኢትዮጵያ ባለስልጣን ቅሬታ ማቅረብ ትችላለህ።",
        },
        {
          heading: "ደህንነት",
          body: "HTTPS፣ የተመሰጠሩ የይለፍ ቃላትና የመዳረሻ ቁጥጥሮችን እንጠቀማለን። ማንኛውም አገልግሎት ፍጹም ደህንነቱ የተጠበቀ አይደለም። መለያህ አደጋ ላይ ነው ብለህ ካሰብክ የይለፍ ቃልህን ቀይርና ንገረን።",
        },
        {
          heading: "በዚህ ማስታወቂያ ላይ የሚደረግ ለውጥ",
          body: "ይህን ማስታወቂያ ልናሻሽል እንችላለን። ከላይ ያለውን ቀን እንቀይራለን፤ ለውጡ ጉልህ ከሆነ በመተግበሪያው ወይም በኢሜይል እናሳውቅሃለን። ከለውጡ በኋላ ኪፍተትን መጠቀምህን ከቀጠልክ የተሻሻለው ማስታወቂያ ይሠራል።",
        },
      ],
    },
    waitlist: {
      heading: "የመስተጀት ዝርዝሩን ከተቀላቀልክ",
      intro:
        "የመስተጀት ዝርዝሩ ከተማሪ መለያ የተለየ ነው። ኪፍተት ሲጀምር አንድ ጊዜ ለማሳወቅና ከታች የተገለጸውን የመስተጀት ቅናሽ ለማስኬድ ነው።",
      sections: [
        {
          heading: "ምን እንሰበስባለን",
          body: "ስምህ፣ የሞባይል ቁጥርህና የመረጥከው ቋንቋ። ለመገናኘት እንደተስማማህ፣ ቀኑንና የተስማማህበትን የማስታወቂያ ቅጂ ምልክት እናደርጋለን። ቴሌግራም ካገናኘህ ለእኛ የሚያስታውቅህን የቴሌግራም መለያ እናስቀምጣለን። መግለጫ ከላክክልን ጽሑፉን እናስቀምጣለን።",
        },
        {
          heading: "ለምን እንሰበስባለን",
          body: "ኪፍተት የተጀመረበትን አንድ ጊዜ ለማሳወቅ ብቻ። ዓላማው ሙሉ በሙሉ ይህ ነው። ቁጥርህ አይሸጥም፣ ለማስታወቂያ አይውልም፣ ለማንም አይጋራም። በዚያው ስልክ ስትመለስ እንድንለይ ቁጥርህ ቁልፍ ነው፣ ስለዚህ ቅጹን ሁለት ጊዜ ብታስገባ በዝርዝሩ ላይ ሁለት ጊዜ አትገባም።",
        },
        {
          heading: "የክፍል ወሩ",
          body: "የቴሌግራም ማህበረሰባችን ካቀላቀልክና ስለ ማሳያው ያገኘኸውን በአንድ መስመር ከላክክልን፣ በመስተጀት ቀን አንድ ወር ፕሪሚየም ታገኛለህ። ይህ የቅናሹ ሁኔታ ነው፤ በኋላ ከመገኘት ይልቅ አሁን በግልጽ መናገር እንመርጣለን። ወደ ዝርዝሩ ገብተህ ሁለቱንም ካላደረግክ ቦታህ ይቆያል — ግን የክፍል ወሩን አታገኝም። ቅናሹ ስለ እኛ ጥሩ ነገር እንድትናገር የሚያስገድድ አይደለም።",
        },
        {
          heading: "መግለጫህ",
          body: "አንድ መስመር ከላክክልን እናስቀምጠዋለን፣ እናነባዋለንም። መጀመሪያ ሳንጠይቅህ ምንም አናትምም፤ በማንኛውም ጊዜም እንድናጠፋው መጠየቅ ትችላለህ። ካሳተምነው በቃላት ብቻ እናሳየዋለን፤ በልዩ ሁኔታ ካልጠየቅኸን በስተቀር የቴሌግራም መለያህን፣ ስልክ ቁጥርህን ወይም ስምህን አናሳይም።",
        },
        {
          heading: "ለምን ያህል ጊዜ እናስቀምጣለን",
          body: "ኪፍተት እስኪጀምር ድረስ፣ እና የክፍል ወርህን ለመጠየቅ ተገቢ እድል እስኪኖርህ ድረስ። ከዚያ በኋላ ዝርዝሩን እናጠፋለን፤ መግለጫህ እንዲቆይ ካልጠየቅክ ወይም የኪፍተት ተማሪ ካልሆንክ በስተቀር። የተማሪ ከሆንክ የተማሪው ማስታወቂያ ይሠራል።",
        },
        {
          heading: "መረጃህን ማጥፋት",
          body: "በቴሌግራም መልእክት ላክልን፣ ወይም ከላክናቸው መልእክቶች ውስጥ መልስ ስጥና ጠይቅ። የዝርዝር መዝገብህንና መግለጫህን እናጠፋለን። መጀመሪያ ማንነትህን እንድታረጋግጥ አንጠይቅም — መልእክቱ ከማን እንደመጣ እናውቃለን።",
        },
        {
          heading: "መብትህ",
          body: "የኢትዮጵያ የመረጃ ጥበቃ ረቂቅ ሕግ ቁጥር 1321/2024 ስለአንተ ያለንን መረጃ የማየት፣ የማስተካከል፣ የማጥፋትና አጠቃቀሙን የመቃወም መብት ይሰጣል። ከላይ የተጠቀሰው መልእክት ለማንኛውም መብት በቂ ነው። በደንብ ካልተስተናገድን ለሚመለከተው የኢትዮጵያ ባለስልጣን ቅሬታ ማቅረብ ትችላለህ።",
        },
      ],
    },
  },
} as const;

export default function Privacy() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-16">
      <h1 className="font-display font-semibold text-3xl tracking-[-0.02em]">
        Privacy — Kiftet
      </h1>

      {/*
        Both languages render. A notice a person can't read is not consent, and
        Kiftet is used in both scripts by design.
      */}
      {(["en", "am"] as const).map((lang) => (
        <section key={lang} className="mt-10">
          <h2 className="text-muted-foreground text-xs uppercase tracking-wide">
            {lang === "en" ? "English" : "አማርኛ"}
          </h2>
          <p className="mt-3 leading-7">{notice[lang].intro}</p>
          <p className="mt-2 text-muted-foreground text-sm">
            {notice[lang].updated}
          </p>

          <div className="mt-8">
            <h3 className="font-display font-semibold text-xl">
              {notice[lang].students.heading}
            </h3>
            <p className="mt-2 text-muted-foreground leading-7">
              {notice[lang].students.intro}
            </p>
            <dl className="mt-6 space-y-6">
              {notice[lang].students.sections.map((section) => (
                <div key={section.heading}>
                  <dt className="font-medium">{section.heading}</dt>
                  <dd className="mt-1 text-muted-foreground leading-7">
                    {section.body}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="mt-10">
            <h3 className="font-display font-semibold text-xl">
              {notice[lang].waitlist.heading}
            </h3>
            <p className="mt-2 text-muted-foreground leading-7">
              {notice[lang].waitlist.intro}
            </p>
            <dl className="mt-6 space-y-6">
              {notice[lang].waitlist.sections.map((section) => (
                <div key={section.heading}>
                  <dt className="font-medium">{section.heading}</dt>
                  <dd className="mt-1 text-muted-foreground leading-7">
                    {section.body}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      ))}

      <p className="mt-12 flex flex-wrap gap-x-5 gap-y-2">
        <Link
          to="/terms"
          className="text-gold underline-offset-4 hover:underline"
        >
          Terms
        </Link>
        <Link to="/" className="text-gold underline-offset-4 hover:underline">
          ← Kiftet
        </Link>
      </p>
    </main>
  );
}
