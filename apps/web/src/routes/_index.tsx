import { Button, buttonVariants } from "@kiftet/ui/components/button";
import { cn } from "@kiftet/ui/lib/utils";
import { Mic, RefreshCcw, ScanSearch, Volume2 } from "lucide-react";
import {
	type CSSProperties,
	type ReactNode,
	useEffect,
	useRef,
	useState,
} from "react";
import { Link, useNavigate } from "react-router";
import { BrandMark, BrandSignature, GapClosingMark } from "@/components/brand-mark";
import { CoverageView } from "@/components/gap-list";
import { apiError } from "@/lib/api";
import { setDemoUser, startDemo } from "@/lib/demo";
import { useOnScreen } from "@/lib/on-screen";
import type { Route } from "./+types/_index";

export function meta(_args: Route.MetaArgs) {
	return [
		{ title: "Kiftet — Close the gap" },
		{
			name: "description",
			content:
				"Kiftet listens to what you remember, catches the concepts that didn't stick, and teaches only those — spoken, calm, and built for Ethiopia's national exam.",
		},
	];
}

const LOOP = [
	{
		step: "Speak",
		title: "Say what you remember",
		text: "Pick a chapter and explain it out loud, no notes, no prompts. Speaking forces clarity — you know what you know, and what you don't.",
		icon: Mic,
	},
	{
		step: "Diagnose",
		title: "See what's missing",
		text: "The concepts we check are compared against what you said. Solid ideas stay, gaps surface — shown as a picture you can read in one glance.",
		icon: ScanSearch,
	},
	{
		step: "Relearn",
		title: "Hear only what you missed",
		text: "A short, spoken lesson covers just the gaps — not the whole chapter. Each pass targets only what didn't land the first time.",
		icon: Volume2,
	},
	{
		step: "Retest",
		title: "Prove it stuck",
		text: "Freshly worded questions on those same gaps, then a before/after score. You leave with a clear picture of what closed and what's still open.",
		icon: RefreshCcw,
	},
] as const;

const PASS_RATES = [
	{ year: "2023", rate: "3.2%" },
	{ year: "2024", rate: "5.4%" },
	{ year: "2025", rate: "8.4%" },
	{ year: "2026", rate: "12.8%" },
] as const;

/* Reveals a string word-by-word: each word slides up and straightens out of
   its clipped box. Staggered by --kft-i, so the whole line reads left to
   right — the landing page's signature reveal. Pure CSS, no library. */
function Words({
	text,
	offset = 0,
	gap = 45,
	className,
}: {
	text: string;
	offset?: number;
	gap?: number;
	className?: string;
}) {
	const words = text.replace(/\s+/g, " ").trim().split(" ");
	return (
		<>
			{words.map((w, i) => (
				<span key={`${i}-${w}`} className="kft-word">
					<span
						className={className}
						style={
							{ "--kft-i": `${(offset + i) * gap}ms` } as CSSProperties
						}
					>
						{w}
						{i < words.length - 1 ? "\u00A0" : ""}
					</span>
				</span>
			))}
		</>
	);
}

export default function Home() {
	const hero = useOnScreen<HTMLDivElement>();
	const stats = useOnScreen<HTMLDivElement>();
	const how = useOnScreen<HTMLElement>();
	const rates = useOnScreen<HTMLElement>();
	const cta = useOnScreen<HTMLElement>();

	return (
		<main className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6 lg:px-8">
			{/* ── Hero: the problem, stated plainly ─────────────────── */}
			<section className="grid gap-10 py-12 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-12">
				<div
					ref={hero.ref}
					className={cn("space-y-7", hero.shown && "kft-in")}
				>
					<p
						className="kft-rise font-medium text-muted-foreground text-sm"
						style={{ "--kft-i": "0ms" } as CSSProperties}
					>
						Kiftet · spoken study review for Ethiopian students
					</p>

					<h1 className="relative isolate space-y-3 font-display font-semibold text-4xl text-foreground leading-[1.06] tracking-[-0.03em] sm:text-6xl sm:leading-[1.04]">
						<span aria-hidden="true" className="halo" />
						<span className="block">
							<Words text="Close the gap." className="text-gold" />
						</span>
						<span className="block">
							<Words
								text="87 in every 100 students fail the national exam. Trying harder isn't the answer — knowing which gaps are yours is."
								offset={3}
								gap={30}
							/>
						</span>
					</h1>

					<p
						className="kft-rise max-w-xl text-base text-muted-foreground leading-7 sm:text-lg"
						style={{ "--kft-i": "300ms" } as CSSProperties}
					>
						Kiftet listens to what you remember out loud, finds the specific
						ideas that didn&apos;t stick, teaches only those in a short spoken
						lesson — then retests what stayed. Not another question bank. A
						diagnosis.
					</p>

					<div
						className="kft-rise flex flex-col gap-3 sm:flex-row sm:flex-wrap"
						style={{ "--kft-i": "400ms" } as CSSProperties}
					>
						<Link
							to="/dashboard"
							className={cn(
								buttonVariants({ size: "lg" }),
								"w-full font-medium sm:w-auto",
							)}
						>
							Start closing your gaps
						</Link>
						<a
							href="#how"
							className={cn(
								buttonVariants({ variant: "outline", size: "lg" }),
								"w-full sm:w-auto",
							)}
						>
							How the loop works
						</a>
					</div>
					<p
						className="kft-rise text-sm text-muted-foreground"
						style={{ "--kft-i": "480ms" } as CSSProperties}
					>
						No account?{" "}
						<a
							href="#demo"
							className="font-medium text-gold underline underline-offset-4 hover:text-gold-soft"
						>
							Jump straight into the live demo
						</a>
					</p>
				</div>

				{/* The product, shown as itself */}
				<DemoCard />
			</section>

			{/* ── The statistic that decides the stakes ─────────────── */}
			<section className="surface mt-6 p-6 sm:p-8">
				<div
					ref={stats.ref}
					className={cn(
						"grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center",
						stats.shown && "kft-in",
					)}
				>
					<div>
						<p className="kft-pop font-display font-semibold text-6xl text-gold tracking-[-0.04em] sm:text-7xl">
							87.2<span className="text-3xl text-gold/70">%</span>
						</p>
						<div
							aria-hidden="true"
							className="kft-draw mt-3 h-0.5 w-16 rounded-full bg-gradient-to-r from-gold to-gold/20"
							style={{ "--kft-i": "180ms" } as CSSProperties}
						/>
					</div>
					<div
						className="kft-rise space-y-2 text-muted-foreground text-sm leading-6"
						style={{ "--kft-i": "120ms" } as CSSProperties}
					>
						<p>
							of the{" "}
							<span className="font-medium text-foreground">
								563,500 students
							</span>{" "}
							who sat the 2026 national exam were still failed by the system —
							in the best result the country has recorded.{" "}
							<span className="font-medium text-foreground">565 schools</span>{" "}
							had zero students pass.
						</p>
						<p>
							Students weren&apos;t absent. They sat through the classes.
							What&apos;s missing isn&apos;t exposure — it&apos;s knowing,
							before the exam, which specific ideas didn&apos;t stick.
						</p>
					</div>
				</div>
			</section>

			{/* ── Try it live ──────────────────────────────────────────── */}
			<DemoSection />

			{/* ── The loop ──────────────────────────────────────────── */}
			<section
				id="how"
				ref={how.ref}
				className={cn("scroll-mt-24 pt-20", how.shown && "kft-in")}
			>
				<div className="mb-10 max-w-2xl space-y-3">
					<h2
						className="kft-rise font-display font-semibold text-3xl tracking-[-0.02em] sm:text-4xl"
						style={{ "--kft-i": "0ms" } as CSSProperties}
					>
						Four steps. One loop. Only the gaps.
					</h2>
					<p
						className="kft-rise text-base text-muted-foreground leading-7"
						style={{ "--kft-i": "80ms" } as CSSProperties}
					>
						The sequence is the whole product — recall, diagnose, relearn,
						retest. Nothing in Kiftet exists outside it.
					</p>
					<div
						aria-hidden="true"
						className="kft-draw mt-4 h-0.5 w-24 rounded-full bg-gradient-to-r from-gold/60 to-gold/10"
						style={{ "--kft-i": "140ms" } as CSSProperties}
					/>
				</div>

				<ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					{LOOP.map(({ step, title, text, icon: Icon }, i) => (
						<li
							key={step}
							className="surface kft-rise p-5"
							style={{ "--kft-i": `${160 + i * 90}ms` } as CSSProperties}
						>
							<div className="mb-4 flex items-center justify-between">
								<span className="grid size-10 place-items-center rounded-full border border-gold/30 bg-gold/10 text-gold">
									<Icon className="size-5" aria-hidden="true" />
								</span>
								<span
									className="font-display font-medium text-2xl text-border"
									aria-hidden="true"
								>
									0{i + 1}
								</span>
							</div>
							<p className="font-medium text-[0.72rem] text-gold">{step}</p>
							<h3 className="mt-1 font-display font-semibold text-lg tracking-tight">
								{title}
							</h3>
							<p className="mt-2 text-muted-foreground text-sm leading-6">
								{text}
							</p>
						</li>
					))}
				</ol>
			</section>

			{/* ── Why voice ─────────────────────────────────────────── */}
			<section className="mt-20 grid gap-8 lg:grid-cols-2 lg:items-center">
				<div className="space-y-5">
					<h2 className="font-display font-semibold text-3xl tracking-[-0.02em] sm:text-4xl">
						Voice isn&apos;t a feature. It&apos;s the mechanism.
					</h2>
					<p className="text-base text-muted-foreground leading-7">
						Explaining something out loud is how the underlying learning
						technique actually works. There&apos;s nowhere to hide off-screen —
						there&apos;s no option, no answer key, just what you can produce.
						That honesty is the diagnosis.
					</p>
					<p className="text-base text-muted-foreground leading-7">
						So you speak. Kiftet transcribes, compares what you said against the
						chapter&apos;s concepts, and reads the short lesson back in a calm
						voice. Talk in, talk out.
					</p>
				</div>

				<div className="surface flex flex-col items-center justify-center gap-4 p-8">
					<div className="relative grid place-items-center">
						<span className="absolute inset-0 animate-ring-pulse rounded-full bg-gold/25" />
						<span className="absolute inset-0 animate-ring-pulse rounded-full bg-gold/15 [animation-delay:0.9s]" />
						<div className="relative grid size-32 place-items-center rounded-full border-2 border-gold/50 bg-night-raised text-gold shadow-[0_0_40px_rgba(242,239,233,0.15)]">
							<Mic className="size-11" aria-hidden="true" />
						</div>
					</div>
					<p className="text-center font-medium text-foreground text-sm">
						Tap and speak
					</p>
					<p className="max-w-xs text-center text-muted-foreground text-sm leading-6">
						Says the student. The ring is listening, not judging. What you say
						out loud is the whole record of what stuck.
					</p>
				</div>
			</section>

			{/* ── The numbers, honestly ─────────────────────────────── */}
			<section
				ref={rates.ref}
				className={cn("mt-20", rates.shown && "kft-in")}
			>
				<div className="mb-8 max-w-2xl space-y-3">
					<h2
						className="kft-rise font-display font-semibold text-3xl tracking-[-0.02em] sm:text-4xl"
						style={{ "--kft-i": "0ms" } as CSSProperties}
					>
						The system is improving. That&apos;s not the same as reaching the
						student.
					</h2>
					<p
						className="kft-rise text-base text-muted-foreground leading-7"
						style={{ "--kft-i": "100ms" } as CSSProperties}
					>
						The national pass rate has climbed every year on record. Each step
						is real progress — and each one still leaves the overwhelming
						majority of students outside it. The reform moves at the
						country&apos;s pace. A student&apos;s exam doesn&apos;t wait.
					</p>
				</div>

				<div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
					{PASS_RATES.map(({ year, rate }, i) => (
						<div
							key={year}
							className={cn(
								"surface kft-rise p-5",
								i === PASS_RATES.length - 1 && "border-gold/40 bg-gold/[0.07]",
							)}
							style={{ "--kft-i": `${160 + i * 80}ms` } as CSSProperties}
						>
							<p className="k-label">{year}</p>
							<p
								className={cn(
									"mt-1 font-display font-semibold text-3xl tracking-[-0.02em]",
									i === PASS_RATES.length - 1
										? "text-gold"
										: "text-muted-foreground",
								)}
							>
								{rate}
							</p>
							<p className="mt-2 text-muted-foreground text-xs leading-5">
								{i === PASS_RATES.length - 1
									? "best year on record — and still 87 in 100 failed"
									: "national pass rate"}
							</p>
						</div>
					))}
				</div>
			</section>

			{/* ── Built for the real exam room ──────────────────────── */}
			<section className="mt-20 grid gap-4 md:grid-cols-3">
				<div className="inner-surface p-5">
					<h3 className="font-display font-semibold text-lg tracking-tight">
						A school phone is enough
					</h3>
					<p className="mt-2 text-muted-foreground text-sm leading-6">
						A web app, not an app-store install. Made to run on low bandwidth —
						and if the voice service drops, you keep going by typing.
					</p>
				</div>
				<div className="inner-surface p-5">
					<h3 className="font-display font-semibold text-lg tracking-tight">
						Made for night study
					</h3>
					<p className="mt-2 text-muted-foreground text-sm leading-6">
						Review happens when the day finally quietens down. The interface
						stays a calm black room lit by flat ivory, not a bright quiz app.
					</p>
				</div>
				<div className="inner-surface p-5">
					<h3 className="font-display font-semibold text-lg tracking-tight">
						Honest before/after
					</h3>
					<p className="mt-2 text-muted-foreground text-sm leading-6">
						You see your coverage right after you recall, and again after the
						lesson closes. If part of it is still open, that answer is as useful
						as the progress.
					</p>
				</div>
			</section>

{/* ── CTA ───────────────────────────────────────────────── */}
			<section
				ref={cta.ref}
				className={cn(
					"surface mt-20 border-gold/30 bg-gold/[0.06] p-8 text-center sm:p-12",
					cta.shown && "kft-in",
				)}
			>
				<BrandSignature size={72} className="kft-rise mx-auto mb-6" />
				<h2 className="font-display font-semibold text-3xl tracking-[-0.02em] sm:text-4xl">
					<Words text="Pick a chapter. Speak. Close the gap." />
				</h2>
				<p
					className="kft-rise mx-auto mt-3 max-w-md text-base text-muted-foreground leading-7"
					style={{ "--kft-i": "160ms" } as CSSProperties}
				>
					Pick a chapter, press the ring, and start speaking. The diagnosis
					comes from your own words.
				</p>
				<Link
					to="/dashboard"
					className={cn(
						buttonVariants({ size: "lg" }),
						"kft-rise mt-7 font-medium",
					)}
					style={{ "--kft-i": "240ms" } as CSSProperties}
				>
					Open the study room
				</Link>
			</section>

			<footer className="mt-16 border-border/60 border-t pt-8 dark:border-white/10">
				<div className="flex flex-col items-center gap-4 text-center">
					<BrandMark size={40} className="opacity-60" />
					<p className="max-w-sm text-muted-foreground text-xs leading-6">
						Closing the gap between what a class covers and what a student
						keeps. Built for the national exam — one chapter, one voice, one gap
						at a time.
					</p>
					<p className="text-[0.68rem] text-muted-foreground/60">
						Kiftet · ክፍተት
					</p>
				</div>
			</footer>
		</main>
	);
}

/* The product, shown as itself: a live-looking recall card that already
   finished a diagnosis. Reuses the real CoverageView so the landing and the
   product can never drift apart visually. */
function DemoCard() {
	return (
		<div
			className="surface animate-rise-in overflow-hidden"
			style={{ animationDelay: "0.15s" }}
		>
			<div className="border-border/60 border-b px-6 py-4 dark:border-white/10">
				<div className="mb-2 flex items-center gap-2.5">
					<BrandMark size={22} className="rounded-full" />
					<p className="font-medium text-[0.68rem] text-muted-foreground">
						Kiftet
					</p>
				</div>
				<div className="mb-1 flex items-center justify-between gap-3">
					<p className="k-label">Physics · wave mechanics</p>
					<span className="inline-flex items-center gap-1.5 font-medium text-[0.72rem] text-sage">
						<span
							className="size-1.5 rounded-full bg-sage"
							aria-hidden="true"
						/>
						recalled
					</span>
				</div>
				<h3 className="font-display font-semibold text-xl tracking-tight">
					Heat and Temperature
				</h3>
			</div>

			<div className="p-6">
				<CoverageView
					covered={[
						"Heat flows hot to cold",
						"Thermal equilibrium",
						"Phase changes",
					]}
					missing={[
						"Temperature vs. heat",
						"Heat capacity",
						"Why metal feels colder",
					]}
				/>
			</div>

			<div className="border-border/60 border-t px-6 py-4 dark:border-white/10">
				<Link
					to="/dashboard"
					className={cn(buttonVariants(), "w-full justify-center font-medium")}
				>
					See it on your own chapter
				</Link>
			</div>
		</div>
	);
}

function useScrollReveal<T extends HTMLElement>() {
	const ref = useRef<T | null>(null);
	const [inView, setInView] = useState(false);
	const [proximity, setProximity] = useState(0);
	const [cycle, setCycle] = useState(0);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;

		const reduceMotion =
			typeof window.matchMedia === "function" &&
			window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		if (reduceMotion) {
			setInView(true);
			setProximity(1);
			return;
		}

		if (typeof IntersectionObserver === "undefined") {
			setInView(true);
			setProximity(1);
			return;
		}

		const io = new IntersectionObserver(
			(entries) => {
				const entry = entries[0];
				if (!entry) return;
				setInView(entry.isIntersecting);
				if (entry.isIntersecting) setCycle((c) => c + 1);
			},
			{ threshold: 0.25 },
		);
		io.observe(el);

		let raf = 0;
		const measure = () => {
			cancelAnimationFrame(raf);
			raf = requestAnimationFrame(() => {
				const r = el.getBoundingClientRect();
				const vh = window.innerHeight;
				const center = r.top + r.height / 2 - vh / 2;
				const reach = vh * 0.85;
				setProximity(
					Math.max(0, Math.min(1, 1 - Math.abs(center) / reach)),
				);
			});
		};
		measure();
		window.addEventListener("scroll", measure, { passive: true });
		window.addEventListener("resize", measure);
		return () => {
			io.disconnect();
			cancelAnimationFrame(raf);
			window.removeEventListener("scroll", measure);
			window.removeEventListener("resize", measure);
		};
	}, []);

	return { ref, inView, proximity, cycle };
}

function DemoSection() {
	const { ref, inView, proximity, cycle } = useScrollReveal<HTMLElement>();

	const spring =
		"transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none";

	const stagger = (i: number, child: ReactNode) => (
		<div
			className={cn(
				spring,
				inView ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0",
			)}
			style={{ transitionDelay: inView ? `${i * 90}ms` : "0ms" } as CSSProperties}
		>
			{child}
		</div>
	);

	const glowIntensity = inView ? Math.max(proximity, 0.5) : proximity * 0.4;

	return (
		<section
			ref={ref}
			id="demo"
			className="surface relative mt-10 scroll-mt-24 overflow-hidden rounded-[2rem] border border-gold/25 px-6 py-14 text-center sm:px-12 sm:py-16"
		>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute -top-32 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-gold/15 blur-3xl"
				style={{ opacity: glowIntensity }}
			/>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute -bottom-24 -left-16 size-56 rounded-full bg-gold/10 blur-3xl"
				style={{ opacity: glowIntensity * 0.7 }}
			/>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute -right-16 -top-10 size-56 rounded-full bg-gold/10 blur-3xl"
				style={{ opacity: glowIntensity * 0.6 }}
			/>

			<div className="relative mx-auto flex max-w-2xl flex-col items-center gap-6">
				<div
					aria-hidden="true"
					className={cn("kft-beam", inView && "kft-in")}
				/>
				<div className="relative size-32">
					{cycle > 0 ? (
						<>
							<span
								aria-hidden="true"
								className={cn(
									"absolute inset-0 rounded-full bg-gold/25 blur-2xl transition-opacity duration-500",
									proximity > 0.2 ? "animate-pulse opacity-100" : "opacity-60",
								)}
							/>
							<GapClosingMark
								key={`ring-${cycle}`}
								size={128}
								className="relative text-gold"
							/>
						</>
					) : null}
				</div>

				{stagger(
					0,
					<span className="inline-flex items-center gap-2 rounded-full border border-sage/30 bg-sage/10 px-3 py-1 font-medium text-[0.68rem] tracking-wide text-sage uppercase">
						<span
							className={cn(
								"size-1.5 rounded-full bg-sage transition-opacity duration-500",
								inView && "animate-pulse opacity-100",
							)}
							aria-hidden="true"
						/>
						Live demo · no account
					</span>,
				)}

				<h2
					className={cn(
						"font-display font-semibold text-3xl leading-[1.12] text-foreground tracking-[-0.02em] sm:text-4xl",
						inView && "kft-in",
					)}
				>
					<Words
						text="Feel it for yourself — one round of the loop, right now."
						gap={40}
					/>
				</h2>

				{stagger(
					2,
					<p className="max-w-md text-base text-muted-foreground leading-7">
						Pick the chapter, speak what you remember, and watch Kiftet find
						what didn&apos;t stick — then teach only that, and prove it stayed.
					</p>,
				)}

				{stagger(3, <DemoButton variant="primary" size="lg" />,)}

				{stagger(
					4,
					<p className="text-[0.72rem] text-muted-foreground">
						No email, no password, no card. Your demo is private and expires
						on its own.
					</p>,
				)}
			</div>
		</section>
	);
}

function DemoButton({
	variant = "outline",
	size,
	className,
}: {
	variant?: "primary" | "outline";
	size?: "lg";
	className?: string;
}) {
	const navigate = useNavigate();
	const [pending, setPending] = useState(false);
	const [failure, setFailure] = useState<string | null>(null);

	const launch = async () => {
		setPending(true);
		setFailure(null);
		try {
			const userId = await startDemo();
			setDemoUser(userId);
			navigate("/dashboard");
		} catch (error) {
			setFailure(apiError(error));
			setPending(false);
		}
	};

	return (
		<div className={cn("flex flex-col gap-1", className)}>
			<Button
				size={size}
				variant={variant === "primary" ? "default" : "outline"}
				onClick={launch}
				disabled={pending}
				className="w-full font-medium sm:w-auto"
			>
				{pending
					? "Setting up your demo…"
					: variant === "primary"
						? "Start the live demo →"
						: "Try a live demo"}
			</Button>
			{failure && <p className="text-rust text-xs">{failure}</p>}
		</div>
	);
}
