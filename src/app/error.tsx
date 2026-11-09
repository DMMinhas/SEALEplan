"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="rounded-md border border-red-800 bg-red-50 p-4 text-red-950">
      <h1 className="text-lg font-bold">Something went wrong</h1>
      <p className="mt-1">The page could not be loaded. Please try again in a moment.</p>
      <button
        type="button"
        onClick={reset}
        className="mt-3 rounded-md bg-brand px-4 py-2 font-semibold text-white"
      >
        Try again
      </button>
    </div>
  );
}
