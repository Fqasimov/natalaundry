// PROVISIONAL client-side catalog. `service_prices` in the DB only confirmed
// `item_id`/`service_id` text columns so far (the price/name columns didn't
// come through in the schema dump — re-pull that table). Until then, this
// static list drives the booking screen so it's at least usable; swap for a
// real `service_prices` join the moment we have its full columns.
export type CatalogItem = {
  itemId: string;
  serviceId: string;
  name: string;
  price: number;
  unit: string;
};

export const CATALOG: CatalogItem[] = [
  { itemId: "shirt", serviceId: "wash_iron", name: "Shirt", price: 4, unit: "item" },
  { itemId: "trousers", serviceId: "wash_iron", name: "Trousers", price: 5, unit: "item" },
  { itemId: "dress", serviceId: "dry_clean", name: "Dress", price: 10, unit: "item" },
  { itemId: "suit", serviceId: "dry_clean", name: "Suit (2pc)", price: 15, unit: "item" },
  { itemId: "bedding_set", serviceId: "wash_iron", name: "Bedding set", price: 12, unit: "set" },
  { itemId: "carpet_sqm", serviceId: "carpet_clean", name: "Carpet", price: 6, unit: "m²" },
];
