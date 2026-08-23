<?php

namespace Tests\Feature;

use Tests\TestCase;

/**
 * The console holds a staff access token in sessionStorage, so a single
 * injection on the page is an account takeover. The policy is what makes the
 * next such bug non-exploitable, so it is worth asserting rather than trusting.
 */
class AdminConsoleTest extends TestCase
{
    public function test_the_console_is_served_with_a_nonce_based_policy(): void
    {
        config()->set('services.supabase.url', 'https://project.supabase.co');

        $response = $this->get('/admin')->assertOk();

        $csp = $response->headers->get('Content-Security-Policy');
        $this->assertNotNull($csp);
        $this->assertStringNotContainsString("'unsafe-inline'", $csp);
        $this->assertStringNotContainsString("'unsafe-eval'", $csp);
        $this->assertStringContainsString("default-src 'none'", $csp);
        $this->assertStringContainsString("frame-ancestors 'none'", $csp);
        $this->assertStringContainsString('https://project.supabase.co', $csp);

        // Every inline block on the page has to carry the nonce, or the policy
        // would simply break the console instead of protecting it.
        preg_match("/script-src 'nonce-([^']+)'/", $csp, $m);
        $this->assertNotEmpty($m[1] ?? null);

        $html = $response->getContent();
        $this->assertStringContainsString('<style nonce="'.$m[1].'">', $html);
        $this->assertStringContainsString('<script nonce="'.$m[1].'">', $html);
        $this->assertSame(
            substr_count($html, '<style'),
            substr_count($html, '<style nonce='),
            'an inline <style> is missing its nonce',
        );
        $this->assertSame(
            substr_count($html, '<script'),
            substr_count($html, '<script nonce='),
            'an inline <script> is missing its nonce',
        );
    }

    public function test_a_fresh_nonce_is_issued_per_response(): void
    {
        $first = $this->get('/admin')->headers->get('Content-Security-Policy');
        $second = $this->get('/admin')->headers->get('Content-Security-Policy');

        $this->assertNotSame($first, $second);
    }

    /** The board lists customer names, addresses and phone numbers. */
    public function test_the_console_is_not_indexable(): void
    {
        $this->get('/admin')
            ->assertHeader('X-Robots-Tag', 'noindex, nofollow')
            ->assertHeader('X-Content-Type-Options', 'nosniff');
    }
}
