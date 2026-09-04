<?php

namespace Tests\Feature;

// use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExampleTest extends TestCase
{
    /**
     * The root is a signpost, not a page.
     *
     * Laravel's stock welcome screen reads as "the API is running" to anyone
     * looking for the dispatch console, so routes/web.php redirects to it.
     * This asserted the framework default and went stale the moment that
     * landed.
     */
    public function test_the_root_sends_visitors_to_the_admin_console(): void
    {
        $this->get('/')->assertRedirect('/admin');
    }
}
