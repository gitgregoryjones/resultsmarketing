<?php
/**
 * Theme setup for Results 1.0 Static Pages.
 */
function results10_static_theme_setup()
{
    add_theme_support('title-tag');
}
add_action('after_setup_theme', 'results10_static_theme_setup');
