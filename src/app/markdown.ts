import { Pipe, PipeTransform } from '@angular/core';
import { marked } from 'marked';

@Pipe({
  name: 'markdown',
  pure: true
})
export class MarkdownPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) return '';
    try {
      // Parse markdown to HTML
      return marked.parse(value) as string;
    } catch (e) {
      console.error('Error parsing markdown', e);
      return value;
    }
  }
}
