import { Redirect } from "expo-router";

// The centre tab never renders — its tab button pushes into the catalogue
// directly. This exists so expo-router registers the route.
export default function OrderTab() {
  return <Redirect href="/service/dry_cleaning" />;
}
