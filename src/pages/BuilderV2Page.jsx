import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader';
import Button from '../components/common/Button';
import { useCollection, useFirestoreCrud } from '../hooks/useFirestore';
import Spinner from '../components/common/Spinner';

export default function BuilderV2Page() {
  const { documents: ideationCollections, loading } = useCollection('ideationCollections', [], 'createdAt');
  const collectionsCrud = useFirestoreCrud('ideationCollections');
  const [newCollectionName, setNewCollectionName] = useState('');

  const handleCreateCollection = async () => {
    if (!newCollectionName.trim()) return;
    await collectionsCrud.add({
      name: newCollectionName.trim(),
      status: 'draft',
    });
    setNewCollectionName('');
  };

  return (
    <div className="h-full flex flex-col overflow-y-auto">
      <PageHeader title="Prompt Builder 2.0" description="Integrated, conversational prompt ideation." />

      <div className="p-6 space-y-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={newCollectionName}
            onChange={(e) => setNewCollectionName(e.target.value)}
            placeholder="New collection name, e.g. 'Like a Butterfly'"
            className="flex-grow p-2 rounded-lg"
            style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          />
          <Button onClick={handleCreateCollection} disabled={!newCollectionName.trim()}>Create Collection</Button>
        </div>
        <h2 className="text-lg font-semibold">My Collections</h2>
        <div className="space-y-2">
          {loading && <Spinner />}
          {!loading && ideationCollections.length === 0 && (
            <p className="text-sm text-gray-500">No collections yet. Create one to get started.</p>
          )}
          {ideationCollections.map((collection) => (
            <Link key={collection.id} to={`/builder-v2/${collection.id}`}>
              <div className="p-4 rounded-lg hover:bg-white/10 transition-colors cursor-pointer" style={{ border: '1px solid var(--color-border)' }}>
                <h3 className="font-semibold">{collection.name}</h3>
                <p className="text-xs text-gray-400">
                  Created on: {collection.createdAt?.toDate().toLocaleDateString()}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}