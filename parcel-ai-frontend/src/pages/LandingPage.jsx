import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Database,
  Download,
  ShieldCheck,
  Truck,
  UploadCloud,
} from 'lucide-react'
import { Link } from 'react-router-dom'

const features = [
  { icon: UploadCloud, title: 'Smart data upload', description: 'Bring CSV and Excel shipment files into one clear workflow.' },
  { icon: ShieldCheck, title: 'Automated validation', description: 'Check the structure and quality of shipment records before analysis.' },
  { icon: BarChart3, title: 'Shipment analytics', description: 'Explore trends and operational summaries calculated from your dataset.' },
  { icon: Database, title: 'Carrier and warehouse insights', description: 'Compare shipment volumes wherever the uploaded data supports it.' },
  { icon: Truck, title: 'Delay risk predictions', description: 'Train a model and request predictions through the connected backend.' },
  { icon: Download, title: 'Exportable reports', description: 'Download analysis and validation outputs currently available in your workspace.' },
]

const steps = [
  'Upload a shipment dataset',
  'Validate and inspect its columns',
  'Analyze delivery performance',
  'Train a model and generate predictions',
]
const COPYRIGHT_YEAR = new Date().getFullYear()

export const LandingPage = () => (
  <div className="min-h-screen bg-white text-slate-800">
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
        <Link to="/" className="flex items-center gap-3" aria-label="Parcel-AI home">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 font-bold text-cyan-300">P</span>
          <span><span className="block font-bold tracking-wide text-slate-950">PARCEL-AI</span><span className="block text-xs text-slate-500">Logistics Intelligence</span></span>
        </Link>
        <nav aria-label="Main navigation" className="hidden items-center gap-7 text-sm font-medium text-slate-600 md:flex">
          <a href="#features" className="hover:text-slate-950">Features</a>
          <a href="#how-it-works" className="hover:text-slate-950">How it works</a>
          <a href="#about" className="hover:text-slate-950">About</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/dashboard" className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 sm:inline-flex">Workspace</Link>
          <Link to="/upload" className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
            Get started <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </header>

    <main>
      <section className="overflow-hidden bg-slate-50">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 sm:px-8 md:grid-cols-2 md:items-center md:py-24">
          <div>
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-blue-800">
              <span className="h-2 w-2 rounded-full bg-cyan-500" /> Shipment analytics workspace
            </p>
            <h1 className="max-w-2xl text-4xl font-bold leading-tight tracking-tight text-slate-950 sm:text-5xl">
              Predict Delays. Optimize Deliveries. Make Smarter Decisions.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
              Turn shipment data into actionable logistics intelligence with data validation, delivery analytics, and AI-powered delay risk predictions.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/dashboard" className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800">
                Explore dashboard <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <Link to="/upload" className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:border-slate-400">
                <UploadCloud size={16} aria-hidden="true" /> Upload dataset
              </Link>
            </div>
            <p className="mt-5 text-xs text-slate-500">No account setup required. Connect to your Parcel-AI backend to get started.</p>
          </div>

          <div className="relative mx-auto w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/70 sm:p-7">
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div><p className="text-sm font-semibold text-slate-900">Shipment overview</p><p className="mt-1 text-xs text-slate-500">Your dataset insights, in one place</p></div>
              <span className="rounded-lg bg-blue-50 p-2 text-blue-700"><BarChart3 size={19} aria-hidden="true" /></span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {['Dataset health', 'Delivery trends', 'Carrier insights', 'Delay predictions'].map((label, index) => (
                <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className={`mb-5 h-2 w-8 rounded-full ${index === 0 ? 'bg-cyan-500' : index === 1 ? 'bg-blue-600' : index === 2 ? 'bg-indigo-400' : 'bg-slate-300'}`} />
                  <p className="text-sm font-semibold text-slate-800">{label}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Explore insights from your uploaded records</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-3 rounded-xl border border-dashed border-slate-300 px-4 py-3">
              <CheckCircle2 className="shrink-0 text-emerald-600" size={18} aria-hidden="true" />
              <p className="text-xs leading-5 text-slate-600">Metrics and model outputs are shown only when returned by your connected backend.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-7xl px-5 py-16 sm:px-8 md:py-20">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Built for logistics teams</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">From shipment files to operational insight</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">A practical flow for inspecting real data, finding performance patterns, and assessing delay risk.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, description }) => (
            <article key={title} className="rounded-2xl border border-slate-200 bg-white p-6 transition hover:border-blue-200 hover:shadow-md">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Icon size={20} aria-hidden="true" /></span>
              <h3 className="mt-5 font-semibold text-slate-900">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="bg-slate-950 py-16 text-white md:py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">Workflow</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight">Four steps to clearer operations</h2>
          </div>
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => (
              <li key={step} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-300 text-sm font-bold text-slate-950">{index + 1}</span>
                <p className="mt-5 font-semibold leading-6">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </main>

    <footer id="about" className="border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-10 sm:px-8 md:grid-cols-3">
        <div>
          <p className="font-bold tracking-wide text-slate-950">PARCEL-AI</p>
          <p className="mt-3 max-w-sm text-sm leading-6 text-slate-600">A shipment intelligence workspace for validating data, analyzing delivery performance, and exploring backend-powered delay predictions.</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Explore</p>
          <div className="mt-3 flex flex-col items-start gap-2 text-sm text-slate-600">
            <a href="#features" className="hover:text-blue-700">Features</a>
            <a href="#how-it-works" className="hover:text-blue-700">How it works</a>
            <Link to="/dashboard" className="hover:text-blue-700">Workspace</Link>
          </div>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Source code</p>
          <a href="https://github.com/pravindy021/Parcel-AI" target="_blank" rel="noreferrer" className="mt-3 inline-flex text-sm font-medium text-blue-700 hover:text-blue-800">GitHub repository <ArrowRight size={14} className="ml-1" aria-hidden="true" /></a>
        </div>
      </div>
      <div className="border-t border-slate-100 py-4 text-center text-xs text-slate-500">© {COPYRIGHT_YEAR} PARCEL-AI. Shipment analytics workspace.</div>
    </footer>
  </div>
)

export default LandingPage
