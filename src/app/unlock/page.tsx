import { LockKeyhole, Sparkles } from "lucide-react";

type UnlockPageProps = {
  searchParams: Promise<{
    error?: string;
    profile?: string;
  }>;
};

export default async function UnlockPage({ searchParams }: UnlockPageProps) {
  const resolvedSearchParams = await searchParams;
  const hasError = resolvedSearchParams.error === "1";
  const selectedProfile = resolvedSearchParams.profile;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center p-4">
      <div className="glass-panel w-full max-w-md rounded-[32px] p-6 sm:p-8">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[20px] border border-white/10 bg-white/[0.06]">
          <Sparkles className="h-5 w-5 text-white" />
        </div>

        <div className="mt-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Unlock Halo Chat
          </h1>
          <p className="mt-2 text-sm leading-6 text-white/42">
            Enter the password for the space you want to open.
          </p>
        </div>

        <form action="/api/unlock" method="post" className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm text-white/58">Site key</span>
            <div className="flex items-center gap-3 rounded-[22px] border border-white/10 bg-white/[0.04] px-4 py-3 text-white/72 focus-within:border-white/18">
              <LockKeyhole className="h-4 w-4" />
              <input
                type="password"
                name="key"
                placeholder="Enter access key"
                className="w-full bg-transparent text-sm text-white placeholder:text-white/28 focus:outline-none"
                autoFocus
                required
              />
            </div>
          </label>

          <fieldset>
            <legend className="mb-2 text-sm text-white/58">Profile</legend>
            <div className="grid grid-cols-2 gap-3">
              <label className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4 text-white transition hover:border-white/18 hover:bg-white/[0.06]">
                <input
                  type="radio"
                  name="profile"
                  value="mom"
                  defaultChecked={selectedProfile === "mom"}
                  className="sr-only"
                  required
                />
                <div className="text-sm font-medium">Mom</div>
                <div className="mt-1 text-xs text-white/36">Private family chat space</div>
              </label>

              <label className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4 text-white transition hover:border-white/18 hover:bg-white/[0.06]">
                <input
                  type="radio"
                  name="profile"
                  value="aiden"
                  defaultChecked={selectedProfile !== "mom"}
                  className="sr-only"
                  required
                />
                <div className="text-sm font-medium">Aiden</div>
                <div className="mt-1 text-xs text-white/36">Your own separate space</div>
              </label>
            </div>
          </fieldset>

          {hasError ? (
            <div className="rounded-[20px] border border-rose-300/18 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              Wrong key. Try again.
            </div>
          ) : null}

          <button
            type="submit"
            className="w-full rounded-full bg-white px-5 py-3 text-sm font-medium text-black transition hover:scale-[1.01]"
          >
            Enter
          </button>
        </form>
      </div>
    </main>
  );
}
