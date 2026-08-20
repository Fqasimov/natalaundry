<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Tests\Support\SupabaseSchema;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // Build the mirrored Supabase schema in the in-memory SQLite database.
        SupabaseSchema::create();
    }
}
