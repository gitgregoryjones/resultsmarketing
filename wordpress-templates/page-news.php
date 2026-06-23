<?php
/**
 * Template Name: RM News (Published)
 * Description: WordPress template that renders the published news.html output.
 */

if (!function_exists('rm_render_published_html')) {
    /**
     * Render a published HTML file while preserving static output.
     *
     * @param string $file_name File to render.
     */
    function rm_render_published_html($file_name)
    {
        $candidates = [];

        if (function_exists('get_stylesheet_directory')) {
            $candidates[] = rtrim(get_stylesheet_directory(), '/\\') . '/published-html/' . $file_name;
            $candidates[] = rtrim(get_stylesheet_directory(), '/\\') . '/' . $file_name;
        }

        if (function_exists('get_template_directory')) {
            $candidates[] = rtrim(get_template_directory(), '/\\') . '/published-html/' . $file_name;
            $candidates[] = rtrim(get_template_directory(), '/\\') . '/' . $file_name;
        }

        if (defined('ABSPATH')) {
            $candidates[] = rtrim(ABSPATH, '/\\') . '/' . $file_name;
        }

        foreach (array_unique($candidates) as $path) {
            if (!is_readable($path)) {
                continue;
            }

            $html = file_get_contents($path);
            if ($html === false) {
                continue;
            }

            if (stripos($html, '<base ') === false) {
                $base_url = '';

                if (function_exists('get_stylesheet_directory') && function_exists('get_stylesheet_directory_uri')) {
                    $stylesheet_dir = rtrim(get_stylesheet_directory(), '/\\');
                    if (strpos($path, $stylesheet_dir) === 0) {
                        $relative_dir = trim(str_replace($stylesheet_dir, '', dirname($path)), '/\\');
                        $base_url = rtrim(get_stylesheet_directory_uri(), '/');
                        if ($relative_dir !== '') {
                            $base_url .= '/' . str_replace('\\', '/', $relative_dir);
                        }
                    }
                }

                if ($base_url === '' && function_exists('get_template_directory') && function_exists('get_template_directory_uri')) {
                    $template_dir = rtrim(get_template_directory(), '/\\');
                    if (strpos($path, $template_dir) === 0) {
                        $relative_dir = trim(str_replace($template_dir, '', dirname($path)), '/\\');
                        $base_url = rtrim(get_template_directory_uri(), '/');
                        if ($relative_dir !== '') {
                            $base_url .= '/' . str_replace('\\', '/', $relative_dir);
                        }
                    }
                }

                if ($base_url !== '' && stripos($html, '</head>') !== false) {
                    $html = preg_replace(
                        '/<\/head>/i',
                        '    <base href="' . esc_url($base_url . '/') . '">' . "\n</head>",
                        $html,
                        1
                    );
                }
            }

            echo $html;
            return;
        }

        echo '<!-- RM template warning: Unable to locate ' . esc_html($file_name) . ' in expected locations. -->';
    }
}

rm_render_published_html('news.html');

// Placeholder for repeating news story data (existing stories remain in the published HTML).
$rm_news_stories = [
    [
        'title' => 'News Story Title 1',
        'summary' => 'Existing story block can map to a dynamic post summary.',
        'image_url' => 'https://via.placeholder.com/1200x675',
        'link' => '#',
    ],
    [
        'title' => 'News Story Title 2',
        'summary' => 'Second static story block can be replaced by dynamic data later.',
        'image_url' => 'https://via.placeholder.com/1200x675',
        'link' => '#',
    ],
];

/*
<?php if (!empty($rm_news_stories)) : ?>
<section class="news-story-list">
    <?php foreach ($rm_news_stories as $story) : ?>
        <article class="news-story-item">
            <img src="<?php echo esc_url($story['image_url']); ?>" alt="<?php echo esc_attr($story['title']); ?>">
            <h2><?php echo esc_html($story['title']); ?></h2>
            <p><?php echo esc_html($story['summary']); ?></p>
            <a href="<?php echo esc_url($story['link']); ?>">Read more</a>
        </article>
    <?php endforeach; ?>
</section>
<?php endif; ?>
*/
