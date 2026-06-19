import { useDocumentation } from '@shared/hooks'
import { Block } from '@shared/utils/md-render/block'
import { DocKey } from '@models/docs'

export const DocPage = ({ docKey }: { docKey: DocKey }) => {
  const { getDoc } = useDocumentation()
  const doc = getDoc(docKey)

  if (!doc) return null

  return (
    <>
      {doc.sections.map((section) => (
        <div key={section.id}>
          <h1>{section.title}</h1>
          {section.content.map((block, index) => (
            <Block key={`${section.id}-${index}`} block={block} />
          ))}
        </div>
      ))}
    </>
  )
}
