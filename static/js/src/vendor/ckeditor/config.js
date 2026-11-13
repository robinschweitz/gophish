/**
 * @license Copyright (c) 2003-2018, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see https://ckeditor.com/legal/ckeditor-oss-license
 */

CKEDITOR.editorConfig = function (config) {
	// Define changes to default configuration here.
	// For complete reference see:
	// http://docs.ckeditor.com/#!/api/CKEDITOR.config

	// Keep the visual editing toolbar focused on common content formatting.
	// HTML source editing is handled by the adjacent Ace source mode.
	config.toolbar = [{
			name: 'clipboard',
			items: ['Undo', 'Redo']
		},
		{
			name: 'styles',
			items: ['Format']
		},
		{
			name: 'basicstyles',
			items: ['Bold', 'Italic', 'Underline', 'Strike', 'RemoveFormat']
		},
		{
			name: 'paragraph',
			items: ['NumberedList', 'BulletedList', 'Outdent', 'Indent', 'JustifyLeft', 'JustifyCenter', 'JustifyRight']
		},
		{
			name: 'links',
			items: ['Link', 'Unlink']
		},
		{
			name: 'insert',
			items: ['Image', 'Table', 'HorizontalRule']
		},
		{
			name: 'tools',
			items: ['Maximize']
		}
	];

	// Set the most common block elements.
	config.format_tags = 'p;h1;h2;h3;pre';

	// Simplify the dialog windows.
	config.removeDialogTabs = 'image:advanced;link:advanced;link:target';
	config.fullPage = true;
	config.allowedContent = true;
	config.startupMode = "wysiwyg";
	config.startupShowBorders = false;
};
