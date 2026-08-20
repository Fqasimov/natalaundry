<?php

namespace App\Services;

use App\Models\ServicePrice;
use Illuminate\Support\Facades\Schema;
use RuntimeException;

/**
 * Resolves authoritative item prices.
 *
 * Prefers `public.service_prices`; falls back to config/catalog.php when that
 * table doesn't expose a usable price column (its full column list is still
 * unconfirmed — see the note in that config file). Either way the price used
 * for an order comes from the server, never from the request body.
 */
class CatalogService
{
    private ?array $dbCatalog = null;

    /** @return array{name: string, price: float} */
    public function resolve(string $serviceId, string $itemId): array
    {
        $fromDb = $this->fromDatabase($serviceId, $itemId);
        if ($fromDb !== null) {
            return $fromDb;
        }

        $entry = config("catalog.{$serviceId}.{$itemId}");
        if (! $entry) {
            throw new RuntimeException("Unknown catalogue item [{$serviceId}/{$itemId}].");
        }

        return ['name' => $entry['name'], 'price' => (float) $entry['price']];
    }

    private function fromDatabase(string $serviceId, string $itemId): ?array
    {
        if (! $this->databaseHasPrices()) {
            return null;
        }

        $row = ServicePrice::query()
            ->where('service_id', $serviceId)
            ->where('item_id', $itemId)
            ->first();

        if (! $row) {
            return null;
        }

        $priceColumn = $this->priceColumn();
        $nameColumn = $this->nameColumn();

        return [
            'name' => $nameColumn ? (string) $row->{$nameColumn} : ($itemId),
            'price' => (float) $row->{$priceColumn},
        ];
    }

    private function databaseHasPrices(): bool
    {
        return $this->priceColumn() !== null;
    }

    /** service_prices' price column name, whatever it turns out to be. */
    private function priceColumn(): ?string
    {
        return $this->columnFrom(['price', 'amount', 'unit_price', 'cost']);
    }

    private function nameColumn(): ?string
    {
        return $this->columnFrom(['item_name', 'name', 'title', 'label']);
    }

    private function columnFrom(array $candidates): ?string
    {
        try {
            if (! Schema::hasTable('service_prices')) {
                return null;
            }
            foreach ($candidates as $candidate) {
                if (Schema::hasColumn('service_prices', $candidate)) {
                    return $candidate;
                }
            }
        } catch (\Throwable) {
            // No database configured (or unreachable) — fall back to config.
            return null;
        }

        return null;
    }

    /** The full catalogue, for GET /api/catalog. */
    public function all(): array
    {
        return config('catalog');
    }
}
