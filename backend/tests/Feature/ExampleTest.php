<?php

namespace Tests\Feature;

use Tests\TestCase;

/**
 * Laravel's scaffold test, repurposed.
 *
 * It shipped asserting that `/` returns 200, which stopped being true on
 * 2026-09-03 when the root was pointed at the admin console — before that,
 * visiting localhost:8000 landed on the framework's welcome page and looked
 * like "the API" rather than the product. The redirect is the intended
 * behaviour, so it is what gets asserted.
 */
class ExampleTest extends TestCase
{
    public function test_the_root_redirects_to_the_admin_console(): void
    {
        $this->get('/')->assertRedirect('/admin');
    }
}
