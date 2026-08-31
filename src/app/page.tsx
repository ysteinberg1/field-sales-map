import FieldMap from "@/components/FieldMap";

// page.tsx is a server component, so it can read the server-only
// GOOGLE_MAPS_API_KEY directly and hand it down as a prop — no need for a
// NEXT_PUBLIC_ duplicate of the env var just to get the key to the browser.
export default function Home() {
  const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY ?? "";
  return <FieldMap googleMapsApiKey={googleMapsApiKey} />;
}
