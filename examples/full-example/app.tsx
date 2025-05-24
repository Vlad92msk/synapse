import { SimplePokemonViewer } from './pokemons/PokemonList'
import { SimplePokemonViewer2 } from './pokemons1/PokemonList2'

export function PokemonApp() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <SimplePokemonViewer
      // Все что хотим передать в контекст
        contextProps={{ currentId: 2 }}
        // Собсвенные параметры компонента (не передаются в контекст)
        test="test"
      />
      <SimplePokemonViewer2 />
    </div>
  )
}
