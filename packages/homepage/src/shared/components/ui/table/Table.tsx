import { Table as TableType } from '../../../../types/docs'

import styles from './Table.module.css'

export interface TableProps {
  data: TableType
  className?: string
}

export const TableComponent = (props: TableProps) => {
  const { data, className } = props
  return (
    <div className={`${styles.tableContainer} ${className || ''}`}>
      <table className={styles.table}>
        {data.headers.length > 0 && (
          <thead>
            <tr>
              {data.headers.map((header, index) => (
                <th key={index} className={styles.tableHeader}>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {data.rows
            .filter((row) => row.type === 'data')
            .map((row, index) => (
              <tr key={index} className={styles.tableRow}>
                {row.cells.map((cell, cellIndex) => (
                  <td key={cellIndex} className={styles.tableCell}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  )
}
