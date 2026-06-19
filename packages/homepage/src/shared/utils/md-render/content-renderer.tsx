import { CodeBlock as CodeBlocksComponent } from '../../components/ui/code-block'
import { TableComponent } from '../../components/ui/table'
import { Blockquote } from './blockquote'
import { Diagram } from './diagram'
import { List } from './list'
import { Paragraph } from './paragraph'

export const ContentRenderer = {
  Paragraph,
  CodeBlock: CodeBlocksComponent,
  Table: TableComponent,
  Blockquote,
  List,
  Diagram,
}
