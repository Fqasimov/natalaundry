<?php

namespace Tests\Feature;

use Tests\TestCase;

/**
 * config/catalog.php and the app's lib/catalog.ts must agree.
 *
 * The app carries its own copy so it can show a basket total without a round
 * trip; the server reprices every order from its own. Nothing enforced that
 * the two lists matched, so a price edited on one side would have shown the
 * customer one total at checkout and charged them another — silently, since
 * both halves would still be internally consistent and every existing test
 * would still pass.
 */
class CatalogParityTest extends TestCase
{
    public function test_the_app_and_server_catalogues_agree(): void
    {
        $client = $this->parseClientCatalogue();
        $server = config('catalog');

        $this->assertNotEmpty($client, 'could not parse lib/catalog.ts');
        $this->assertSame(
            array_keys($server),
            array_keys($client),
            'the two catalogues list different services',
        );

        foreach ($server as $serviceId => $items) {
            foreach ($items as $itemId => $entry) {
                $where = "{$serviceId}.{$itemId}";
                $this->assertArrayHasKey($itemId, $client[$serviceId], "{$where} is missing from lib/catalog.ts");
                $this->assertSame(
                    (float) $entry['price'],
                    $client[$serviceId][$itemId]['price'],
                    "{$where} is priced differently in the app",
                );
                $this->assertSame(
                    $entry['name'],
                    $client[$serviceId][$itemId]['name'],
                    "{$where} is named differently in the app",
                );
            }

            foreach (array_keys($client[$serviceId]) as $itemId) {
                $this->assertArrayHasKey(
                    $itemId,
                    $items,
                    "{$serviceId}.{$itemId} is in the app but not on the server — ordering it would fail",
                );
            }
        }
    }

    /**
     * @return array<string, array<string, array{name: string, price: float}>>
     */
    private function parseClientCatalogue(): array
    {
        $path = dirname(__DIR__, 3).'/lib/catalog.ts';
        if (! is_file($path)) {
            $this->markTestSkipped('lib/catalog.ts is not present next to the backend.');
        }

        $source = (string) file_get_contents($path);
        $out = [];

        preg_match_all(
            '/serviceId: "([\w-]+)",(.*?)(?=\n    serviceId: "|\z)/s',
            $source,
            $services,
            PREG_SET_ORDER,
        );

        foreach ($services as [, $serviceId, $body]) {
            preg_match_all(
                '/itemId: "([\w-]+)", name: "([^"]*)", price: ([\d.]+)/',
                $body,
                $items,
                PREG_SET_ORDER,
            );
            foreach ($items as [, $itemId, $name, $price]) {
                $out[$serviceId][$itemId] = ['name' => $name, 'price' => (float) $price];
            }
        }

        return $out;
    }
}
